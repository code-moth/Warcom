#include <stdio.h>
#include <conio.h>
#include <string.h>
#include <ctype.h>
#include <stdlib.h>
#include "datascrn.hpp"
#include "editkeys.hpp"
#include "test.hpp"

#define CHECK(expr) if(!(expr)) error("Memory allocation error.")
#define SCR_PTR(row,col) screen+(row)*160+(col)*2

int weaponSearchAttackscreen(void);
void dumpUnits(int start, int last, DataSet **set1, DataSet **set2);
int findLastUnit(DataSet **set1);

extern int weaponSearch_atkscrn(void);
extern int logfile ;               //  Sets to one if command line requests BATTLE.LOG appended records.
extern FILE *logfileptr;

static const int numUnits = MAX_NUMBER_OF_UNITS;
static char nameBuf[30] = "sample.btl                   ";
static int select =0;   // Start by displaying attack one

void attack(DataScreen &screen, DataSet **set1, DataSet **set2)
{
	short key,i;
	FILE *fileptr;
	char tempBuf[10],buffer[80];
    int start=0;
	Field filename(23,8,30,63,27);


	// put it to the screen //
	screen.display();

	// clear the bottom line
	message(" ",0);

	// print filename
	filename.putString(nameBuf);

	// get data
	screen.getData(set2[select]);

    // show first unit's names
	showUnits(start, set1, set2);


    // attack editor screen loop //
	for (;;)
	{
        // Write any changes from screen fields into dataset
        set2[select]->getDataScreen(&screen);

        // Write unit # selected
        putStr(itoa(select+1,tempBuf,10),2,31,4,127);

        // Write the names of the attacker and defender
		i = atoi(set2[select]->readAddr(A_ATT))-1;
		if ((i>=0) && (i<numUnits))
			putStr(set1[i]->readAddr(U_NAME),11,12,30,27);
		else
			putStr("??? Unknown Unit ???",11,12,30,27);

		i = atoi(set2[select]->readAddr(A_DEF))-1;
		if ((i>=0) && (i<numUnits))
			putStr(set1[i]->readAddr(U_NAME),12,12,30,27);
		else
			putStr("??? Unknown Unit ???",12,12,30,27);

        //  Doing showUnits here used to slow down execution too much in the 80286 days, so the Ins
        //     keypress was introduced for showUnits update and this line was commented out.  No
        //     reason now not to throw this back in though.  Cleaner screen updates with no
        //     appreciable delay.
        showUnits(start, set1, set2);

		// ENTER COMMAND LOOP
        key = screen.edit();   // Most execution time is here, editing fields.
		switch(key)
		{
			case -1:   set2[select]->getDataScreen(&screen);
                       return;

			case PGUP: if (select > 0)
						  {
                          set2[select]->getDataScreen(&screen);
                          select--;
                          screen.getData(set2[select]);
						  }
						  break;

			case PGDN: if (select < numUnits-1)
						  {
                          set2[select]->getDataScreen(&screen);
                          select++;
                          screen.getData(set2[select]);
						  }
						  break;

			case HOME: set2[select]->getDataScreen(&screen);
                       select = 0;
                       screen.getData(set2[select]);
                       break;

			case END:  set2[select]->getDataScreen(&screen);
                       select = numUnits-1;
                       screen.getData(set2[select]);
                       break;

			case F1:   set2[select]->getDataScreen(&screen);
                       screen.save();
                       showTxtFile("help.txt");
                       i = weaponSearch_atkscrn();
                       if (i>=0)
                           set2[select]->putData(weapName(i),A_WEAPON);
                       screen.display();
                       filename.putString(nameBuf);
                       screen.getData(set2[select]);
                       break;

            case F2:   // Attempting to resolve bug that copies current attack over attack 1 during filename edit.
                       set2[select]->getDataScreen(&screen);
                       filename.putField();
                       filename.getString(nameBuf);
                       screen.getData(set2[select]);
                       break;

			case F3:   if (message("Load new file? (y/n)",1))
                           {
                           // open file, read in old data set, and close file //
                           fileptr = fopen(nameBuf,"rb");
                           if (!fileptr)
                               message("File Error! Hit any key to continue.",1);
                           else
                               {
                               message("Loading file...",0);
                               for (i=0;i<numUnits;i++)
                                   set2[i]->restoreData(fileptr,i);
                               fclose(fileptr);
                               select = 0;
                               screen.getData(set2[select]);
                               }
                           }
                       message(" ",0);
                       break;

            case F4:   if (message("Save file? (y/n)",1))
                           {
                           set2[select]->getDataScreen(&screen);
                           fileptr = fopen(nameBuf,"wb");
                           if (!fileptr)
                               message("File Creation Error!  Press any key to continue.",1);
                           else
                               {
                               message("Saving file...",0);
                               for(i=0; i<numUnits; i++)
                                   set2[i]->saveData(fileptr,i);
                               fclose(fileptr);
                               }
                           }
                       // Attempting to resolve bug that can copy current attack over attack 1 during save.
                       select = 0;
                       screen.getData(set2[select]);
                       message(" ",0);
                       break;

            case F5:   if (start > 4) // scroll names down
                           {
                           start -= 5;
                           showUnits(start, set1, set2);
                           }
                       break;

            case F6:   if (start < numUnits - 5) // scroll names up
                           {
                           start += 5;
                           showUnits(start, set1, set2);
                           }
                       break;

            case F7:   set2[select]->clear();
                       screen.getData(set2[select]);
                       break;

            case F8:   if (message("Clear all attacks? (y/n)",1))
                           {
                           for (i=0;i<numUnits;i++)
                           set2[i]->clear();
                           screen.getData(set2[select]);
                           }
                       message(" ",0);
                       break;

            case F9:   set2[select]->getDataScreen(&screen);
                       if (message("Resolve this attack? (y/n)",1))
                           {
                           if (logfile == 1)   // Open logfile if cmdline asked for it.
                               {               // Append will create the file if it's not there.
                               logfileptr = fopen("battle.log","a");
                               if (logfileptr == NULL)
                                   logfile = 0;  // File error turns off logging.
                               else
                                   fprintf(logfileptr,"****  F9  - Resolve ONE attack   ********************************************************************\n");
                               }
                           if (getWeap(set2[select],set1)==NO_WEAPON) break;
                           resolve(set2[select],set1,0);
                           if (logfileptr != NULL)
                               {
                               fprintf(logfileptr,"  \n");
                               fclose(logfileptr);  // Close logfile if writing
                               }
                           }
                       message(" ",0);
                       showUnits(start, set1, set2);
                       break;

            case F10:  set2[select]->getDataScreen(&screen);
                       if (message("Resolve all attacks? (y/n)",1))
                           {
                           if (logfile == 1)   // Open logfile if cmdline asked for it.
                               {               // Append will create the file if it's not there.
                               logfileptr = fopen("battle.log","a");
                               if (logfileptr == NULL)
                                   logfile = 0;  // File error turns off logging.
                               else
                                   fprintf(logfileptr,"****  F10 - Resolve ALL attacks  ********************************************************************\n");
                               }
                           for(i=0;i<numUnits;i++)
                           // NOTE -----
                           // Might want to associate an error message with this no-weapon
                           //    exception/termination
                           if (getWeap(set2[i],set1)==NO_WEAPON) goto ENDLOOP;
                           fileptr = fopen("backup.unt","wb");
                           message("Saving units to backup.unt...",0);

                           for(i=0;i<numUnits;i++)
                               set1[i]->saveData(fileptr,i);
                           fclose(fileptr);

                           for  (i=0;i<numUnits;i++)
                               {
                               sprintf(buffer,"Resolving attack %i",i+1);
                               message(buffer,0);
                               resolve(set2[i],set1,1);
                               }
                           if (logfileptr != NULL)
                               {
                               fprintf(logfileptr,"  All attacks are finished.\n\n");
                               fclose(logfileptr);  // Close logfile if writing
                               }
                       }
                       message(" ",0);
                       showUnits(start, set1, set2);
                       break;
            case ALTF1:if (logfile == 1)       // Logfile dump possible only if /L cmdline specified
                           {
                           if (message("Dump units to log? (y/n)",1))  // Confirm unit dump to logfile
                               {
                               logfileptr = fopen("battle.log","a");
                               if (logfileptr != NULL)
                                   {
                                   int lastUnit = 5;   // Default.  But use findLastUnit() below
                                   message("Dumping to BATTLE.LOG ....",0);
                                   lastUnit = findLastUnit(set1);
                                   fprintf(logfileptr,"****  Alt-F1 Unit Dump           ********************************************************************\n");
                                   dumpUnits(0, lastUnit, set1, set2);
                                   fprintf(logfileptr,"  Log dump is finished.\n\n");
                                   fclose(logfileptr);  // Close logfile if writing
                                   }
                               else
                                   logfile = 0;  // File error turns off logging.
                               }
                           message(" ",0);  // Clear message line
                           }   // Down here immediately if /L command line option was not in effect.
                       break;
            case INS:  set2[select]->getDataScreen(&screen);
                       showUnits(start, set1, set2);
            ENDLOOP:;
		}
	}
}


// For Alt-F1 unit dump, need a decent idea of what unit number to stop dumping at.  Will dump units
//   until all the rest on up have no initial hits specified, say.  So count backwards from the top
//   looking for a unit that has this data filled in.
int findLastUnit(DataSet **set1)
{
    char hitstring[5];
    int hits ;
    int unit = (numUnits-1);
    int foundUnit = 0;

    while ((unit > 0) && !(foundUnit))
        {
        set1[unit]->fetchData(hitstring,U_HT_S);
        hits = atoi(hitstring);
        if (hits != 0)
            foundUnit = 1;
        else
            unit-- ;
        }
    return unit ;
}


// Like showUnits, except tailored for the Alt-F1 unit dump to the log file.
//   Takes advantage of the clever showUnits coding.
void dumpUnits(int start, int last, DataSet **set1, DataSet **set2)
{
    int i,j,k,l;
    char buffer[20];
    union
        {
        struct
            {
            char num1[4];
            char shld1;
            char spear1;
            char space1;
            char name1[31];
            char percent[4];
            char mc[2];
            char morale[6];
            char men[5];
            char slash1;
            char menstart[5];
            char hit[4];
            char slash2;
            char hitstart[4];
            } field;
        char addr[76];
        } string;

    fprintf(logfileptr,"  ID-----Unit Name----------------------%%ef-F-mora-----MEN------HITS------\n");
    for (i=start;i<=last;i++)
        {
        memset(string.addr,' ',75);
        if (i<numUnits)
            {
            itoa(i+1,string.field.num1,10);
            set1[i]->fetchData(string.field.name1,U_NAME);
            if (checkStatus(set2,i)/2) string.field.shld1 = 233;
            if (checkStatus(set2,i)%2) string.field.spear1 = 24;

            // calculate % strength
            l = atoi(UNIT(i,U_NM_S));
            k = atoi(UNIT(i,U_NM_N));
            if ( (l>0) && (k>=0) )
                strncpy(string.field.percent, itoa((100L*(long)k)/(long)l,buffer,10),3);

            string.field.mc[0] = *(UNIT(i,U_MC)); // morale failure
            strncpy(string.field.morale,UNIT(i,U_MR_N),4); // morale rating
            strncpy(string.field.men,UNIT(i,U_NM_N),4); // num of men
            string.field.slash1 = '/';
            strncpy(string.field.menstart,UNIT(i,U_NM_S),4); // num of men started with
            strncpy(string.field.hit,UNIT(i,U_HT_N),3); // ave hits
            string.field.slash2 = '/';
            strncpy(string.field.hitstart,UNIT(i,U_HT_S),3); // ave hits start
            }

        fprintf(logfileptr,"  ");
        for (j=0; j<72; j++)
            {
            fputc(string.addr[j],logfileptr);
            }
        fprintf(logfileptr,"\n");
        }
}


void showUnits(int start, DataSet **set1, DataSet **set2)
{
    int i,j,k,l;
    char buffer[20];

    union
        {
        struct
            {
            char num1[3];
            char shld1;
            char spear1;
            char space1;
            char name1[31];
            char percent[4];
            char mc[2];
            char morale[5];
            char ob[4];
            char db[4];
            char exh[4];
            char mov[4];
            char men[5];
            char hit[4];
            } field;
        char addr[80];
        } string;

    for (i=start,j=0;i<start+5;i++,j++)
        {
		memset(string.addr,' ',79);
		if (i<numUnits)
            {
			itoa(i+1,string.field.num1,10);
			set1[i]->fetchData(string.field.name1,U_NAME);
			if (checkStatus(set2,i)/2) string.field.shld1 = 233;
			if (checkStatus(set2,i)%2) string.field.spear1 = 24;

            // calculate % strength
            l = atoi(UNIT(i,U_NM_S));
            k = atoi(UNIT(i,U_NM_N));
            if ( (l>0) && (k>=0) )
				strncpy(string.field.percent, itoa((100L*(long)k)/(long)l,buffer,10),3);

            // morale failure
            string.field.mc[0] = *(UNIT(i,U_MC));
            // morale rating
            strncpy(string.field.morale,UNIT(i,U_MR_N),4);
            // offensive bonus
            strncpy(string.field.ob,UNIT(i,U_OB_N),3);
            // defensive bonus
            strncpy(string.field.db,UNIT(i,U_DB_N),3);
            // exhaustion pts
            strncpy(string.field.exh,UNIT(i,U_EX_N),3);
            // movement pts
            strncpy(string.field.mov,UNIT(i,U_MV_N),3);
            // num of men
            strncpy(string.field.men,UNIT(i,U_NM_N),4);
            // ave hits
            strncpy(string.field.hit,UNIT(i,U_HT_N),3);
            }

		killNull(string.addr,79);
		putStr(string.addr,16+j,4,73,120);
        }
}


void killNull(char * string, int length)
{
	int i;
	for(i=0;i<length;i++)
	  if(string[i] == 0) string[i] = ' ';
}

int checkStatus(DataSet **set2, int unit)
{
	int i,a=0,d=0;

	unit++;

	for (i=0;i<numUnits;i++)
	{
		if (atoi(set2[i]->readAddr(A_ATT)) == unit) a = 1;
		if (atoi(set2[i]->readAddr(A_DEF)) == unit) d = 1;
	}
	return a+d*2;
}




