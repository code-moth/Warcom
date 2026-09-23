#include <dos.h>
#include <time.h>
#include <stdio.h>
#include <conio.h>
#include <ctype.h>
#include <string.h>
#include <stdlib.h>
#include <alloc.h>
#include "datascrn.hpp"
#include "editkeys.hpp"
#include "test.hpp"

#define CHECK(expr) if(!(expr)) error("Memory allocation error.")
#define SCR_PTR(row,col) screen+(row)*160+(col)*2

extern int weaponSearch_atkscrn(void);

const int numUnits = MAX_NUMBER_OF_UNITS;
char nameBuf[30] = "sample.unt                   ";
DataSet *tempData;
char far *screen = (char far *) 0xb8000000 ;
int restrict = 0;
int logfile = 0;               //  Sets to one if command line requests BATTLE.LOG appended records.
FILE *logfileptr;
signed long nGenerate = -1 ;   //  Used by RESOLVE's defineRandomGuyHits(), but needs a main() initialization

main(int numArgs, char**args)
{
	short key,i;
	FILE *fileptr;
	int select = 0;
	char tempBuf[10];
    // Compile with the "Compact" memory model (64k code, 1M static data) so the DataSet elements
    //    can be increased in number and allocated on far (consolidated) heap.
    DataSet *set1[numUnits];
    DataSet *set2[numUnits];
	Field filename(21,8,30,63,27);

    randomize();                   // Get seed from clock
    nGenerate = -(random(65535));  // Get a (negative) seed for use with ran1 routine

    // Check for command-line startup parameters.  Have this be case-insensitive.
    for (i=1;i<=numArgs;i++)
        {
        if ( (!strcmp("/M",args[i])) || (!strcmp("/m",args[i])) )   screen = (char far *) 0xb0000000;
        if ( (!strcmp("/D",args[i])) || (!strcmp("/d",args[i])) )   srand(444);   // Set seed for demo mode
        if ( (!strcmp("/L",args[i])) || (!strcmp("/l",args[i])) )   logfile = 1;  // Request BATTLE.LOG file append.
        if ( (!strcmp("/C",args[i])) || (!strcmp("/c",args[i])) )   restrict = 1; // OB, DB, movement not
        }                                                                         //   subject to exhaustion

    // Put up intro message & impose slight delay so that it is actually readable.
    showTxtFile("intro.txt");
    _setcursortype(_NOCURSOR);
    delay(2250);
    _setcursortype(_NORMALCURSOR);
    message("Loading WARCOM...",0);

    // set up table of weapons
    initWeap();

	// grab screen image and create object to act on it //
	DataScreen screen("scrn1.txt");
	DataScreen attScrn("scrn2.txt");

	// put it to the screen //
	screen.display();

	// define array of dataSets to hold all the units //
	for(i=0;i<numUnits;i++)
        {
		set1[i] = new DataSet(&screen);
		CHECK(set1[i]);
        set1[i]->clear();

		set2[i] = new DataSet(&attScrn);
		CHECK(set2[i]);
        set2[i]->clear();
        }

    // create a temporary DataSet for storing intermediate combat results
    tempData = new DataSet(&screen);
	CHECK(tempData);

	// clear the bottom line
	message(" ",0);

	// print filename
	filename.putString(nameBuf);

	// Debug memory diagnostics ------------
    //    printf("Coreleft: %ld\n",coreleft());
	//    printf("Far core: %ld",farcoreleft());
    // -------------   Coreleft is %d for small memory models

	// edit screen //
	for (;;)
    {
		putStr(itoa(select+1,tempBuf,10),2,31,4,127); // write unit # selected
		key = screen.edit();
		switch(key)
		{
			case -1:   if(message("Do you really want to quit? (y/n)",1))
                            {
                            clrscr();
                            return 0;
                            }
                       message(" ",0);

			case PGUP: if (select > 0)
						  {
							  set1[select]->getDataScreen(&screen);
							  select--;
							  screen.getData(set1[select]);
						  }
						  break;

			case PGDN: if (select < numUnits-1)
						  {
							  set1[select]->getDataScreen(&screen);
							  select++;
							  screen.getData(set1[select]);
						  }
						  break;

			case HOME: set1[select]->getDataScreen(&screen);
						  select = 0;
						  screen.getData(set1[select]);
						  break;

			case END:  set1[select]->getDataScreen(&screen);
						  select = numUnits-1;
						  screen.getData(set1[select]);
						  break;

			case F1:   set1[select]->getDataScreen(&screen);
						  screen.save();
                    showTxtFile("help.txt");
                    i = weaponSearch_atkscrn();
                    if (i>=0)
						     set1[select]->putData(weapName(i),U_WEAPON);
						  screen.display();
						  filename.putString(nameBuf);
   					  screen.getData(set1[select]);
						  break;

			case F2:   filename.putField();
						  filename.getString(nameBuf);
						  break;

			case F3: if (message("Load new file? (y/n)",1))
						{
						  // open file, read in old data set, and close file //
						  fileptr = fopen(nameBuf,"rb");

						  if (!fileptr)
							  message("File Error! Hit any key to continue.",1);
						  else
						  {
							 message("Loading file...",0);

							 for (i=0;i<numUnits;i++)
								set1[i]->restoreData(fileptr,i);

							 fclose(fileptr);
							 select = 0;
							 screen.getData(set1[0]);
						   }
						}
						message(" ",0);
						break;

			case F4:    if (message("Save file? (y/n)",1))
						{
							set1[select]->getDataScreen(&screen);
							fileptr = fopen(nameBuf,"wb");
							if (!fileptr)
								message("File Creation Error! Hit any key to continue.",1);
							else
							{
								message("Saving file...",0);
								for(i=0;i<numUnits;i++)
									set1[i]->saveData(fileptr,i);
								fclose(fileptr);
							}
						}
						message(" ",0);
						break;

         case F5: set1[select]->getDataScreen(&screen);
                  set1[select]->putData( UNIT(select,U_MR_S), U_MR_N);
                  set1[select]->putData( UNIT(select,U_OB_S), U_OB_N);
                  set1[select]->putData( UNIT(select,U_DB_S), U_DB_N);
                  set1[select]->putData( UNIT(select,U_EX_S), U_EX_N);
                  set1[select]->putData( UNIT(select,U_MV_S), U_MV_N);
                  set1[select]->putData( UNIT(select,U_NM_S), U_NM_N);
                  set1[select]->putData( UNIT(select,U_HT_S), U_HT_N);
                  screen.getData(set1[select]);
                  break;

			case F6: set1[select]->getDataScreen(&screen);
                  if (message("Reset all unit stats? (y/n)",1))
						{
                     for (i=0;i<numUnits;i++)
                     {
                  		set1[i]->putData( UNIT(i,U_MR_S), U_MR_N);
                  		set1[i]->putData( UNIT(i,U_OB_S), U_OB_N);
                  		set1[i]->putData( UNIT(i,U_DB_S), U_DB_N);
                  		set1[i]->putData( UNIT(i,U_EX_S), U_EX_N);
                  		set1[i]->putData( UNIT(i,U_MV_S), U_MV_N);
                  		set1[i]->putData( UNIT(i,U_NM_S), U_NM_N);
                  		set1[i]->putData( UNIT(i,U_HT_S), U_HT_N);
                     }
                     screen.getData(set1[select]);
                  }
                  message(" ",0);
                  break;

         case F7: set1[select]->clear();
                  screen.getData(set1[select]);
                  break;

			case F8: if (message("Clear all unit stats? (y/n)",1))
						{
                     for (i=0;i<numUnits;i++)
                        set1[i]->clear();

                     screen.getData(set1[select]);
                  }
                  message(" ",0);
                  break;

			case F9: if (select < numUnits-1)
						{
						   set1[select]->getDataScreen(&screen);
						   select++;
						}
						break;

			case F10:set1[select]->getDataScreen(&screen);
						screen.save();
						attack(attScrn,set1,set2);
						screen.display();
						filename.putString(nameBuf);
   					screen.getData(set1[select]);
						break;
		}

	}
}

const char *putStr(const char *inStr, int row, int col, int length, char color)
{
	int i;
    char far *tempPtr = SCR_PTR(row,col);
	const char *tStr = inStr;
	char inChar;

	for (i=0;i<length;i++) // clear the current entry
	{
	   *(tempPtr++) = ' ';
       *(tempPtr++) = color;
	}

	tempPtr = SCR_PTR(row,col);
	for (i=0;i<length;i++) // write chars until end of string or NULL
	{
		if (!(inChar = *(tStr++))) break; // break on NULL
		*tempPtr = inChar;
		tempPtr+=2;
	}
	return inStr;
}

int message(char *msg, int flag) // print queries at bottom of screen
{
	//flag=0  just print msg
	//flag=1  wait for (y/n) response
	int i;

	putStr(msg,24,0,80,12);

	if (flag)
		if (toupper(getch()) == 'Y') return 1;

	return 0;
}

void showTxtFile(char* fname)
{
	FILE *filePtr = fopen(fname,"rb");
   int i;
   char far *tmp = screen;

   if (!filePtr)
   {
   	message("File Missing! Exiting to Dos. Hit any key.",1);
      exit(0);
   }

   for (i=0;i<4320;i++)
   	*(tmp++) = fgetc(filePtr);

   message(" ",0);
   fclose(filePtr);
}

