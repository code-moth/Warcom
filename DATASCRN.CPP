//
#include <stdio.h>
#include <iostream.h>
#include <stdlib.h>
#include <conio.h>
#include <string.h>
#include "datascrn.hpp"
#include "editkeys.hpp"

#define SET_CURSOR(x,y) gotoxy(((y)+1),((x)+1)); tempRow = x; tempCol = y;
#define PUT_CHAT(row,col,c,a) *(screen+(row)*160+(col)*2) = (c);*(screen+(row)*160+(col)*2+1) = (a);
#define PUT_AT(row,col,a) *(screen+(row)*160+(col)*2+1) = (a);
#define CHECK(expr) if(!(expr)) error("Memory allocation error.")
#define GET_CHAR(row,col) *(imagePtr+(row)*160+(col)*2)

extern char far *screen;

char const altKey[26] = {30,48,46,32,18,33,34,35,23,36,37,38,50,49,24,25,16,19,31,20,22,47,17,45,21,44};

/*********************** ERROR FUNCTION **************************/

void error(char *message)
{
	cout << message << " Aborting.\n";
	exit(0);
}



/********************* DATASCREEN MEMBERS ************************/

DataScreen::DataScreen(char *imageFile)
{
	FILE *picPtr, *dataPtr;
	short i,j,k,row,col,length,count;
	char *tempPtr, *dot, onAtt,offAtt,temp;
	unsigned char key;

	selector =0;

	// Open the file
	if (!(picPtr = fopen(imageFile,"rb"))) error("Bad File");

	// Allocate memory for image
	if (!(imagePtr = new char[3840])) error("Not enough memory! ");

	// Write image to memory and count tildas
	for (i=0,tempPtr=imagePtr,max=0;i<3840;i+=2)
	{
		*(tempPtr) = fgetc(picPtr);
		temp = *(tempPtr++);
		if (temp == '~') max++;
		*(tempPtr++) = fgetc(picPtr);
	}

	// create arrays //
	CHECK(editField = new Field*[max]);
	CHECK(up = new short[max]);
	CHECK(down = new short[max]);
	CHECK(left = new short[max]);
	CHECK(right = new short[max]);
	CHECK(hotKey = new char[max]);

	count = 0;
	for(i=0,tempPtr=imagePtr ; i<3840 ; i+=2,tempPtr+=2)
	{
		temp = *tempPtr;
		if (temp == '~')
		{
			key =' ';
			row = i/160;
			col = (i%160)/2;

			// search text for length and hot key //
			for (length = 1, dot = tempPtr+2; (*(dot))=='.' ; dot+=2)
				length++;

			if ( (*(dot) <123) && (*(dot)>96) )
			{
				key = *dot;// check for length
				length++;
			}

			// get field colors //
			offAtt = *(tempPtr+1);
			if (offAtt/16 == 1) onAtt = 48; // Cursor attributes defined here
			else onAtt = 31;

			// initialize field //
			editField[count] = new Field(row,col,length,onAtt,offAtt);

			// store hotKey //
			hotKey[count] = key;

			// tag the field for later reference //
			*(tempPtr+2) = count/100;
			*(tempPtr+4) = count%100;
			count++;
		}
	}

   count = 0;
	for(i=0,tempPtr=imagePtr ; i<3840 ; i+=2,tempPtr+=2)
	{
		if (*tempPtr == '~')
		{
			row = i/160;
			col = (i%160)/2;

			/******** find cursor moves ************/

			// left
			left[count]=-1;
			for (j=col-1;j>0;j--)
			{
				key = GET_CHAR(row,j);
				if (key == 186) break;
				if (key == '~')
				{
					left[count] = GET_CHAR(row,j+1)*100 + GET_CHAR(row,j+2);
					break;
				}
			}

         // right
			right[count]=-1;
			for (j=col+1;j<80;j++)
			{
				key = GET_CHAR(row,j);
				if (key == 186) break;
				if (key == '~')
				{
					right[count] = GET_CHAR(row,j+1)*100 + GET_CHAR(row,j+2);
					break;
				}
			}

			// up
			up[count]=-1;
			for (j=row-1;j>=0;j--)
			{
				key = GET_CHAR(j,col);
				if (key == 205) break;
				for (k=0;k<20;k++)
				{
					key = GET_CHAR(j,col+k);
					if (key == '~')
					{
						up[count] = GET_CHAR(j,col+k+1)*100 + GET_CHAR(j,col+k+2);
						goto ENDLOOP1;
					}

					key = GET_CHAR(j,col-k);
					if (key == '~')
					{
						up[count] = GET_CHAR(j,col-k+1)*100 + GET_CHAR(j,col-k+2);
						goto ENDLOOP1;
					}

				}
			} ENDLOOP1:;

			// down
			down[count]=-1;
			for (j=row+1;j<24;j++)
			{
				key = GET_CHAR(j,col);
				if (key == 205) break;
				for (k=0;k<20;k++)
				{
					key = GET_CHAR(j,col+k);
					if (key == '~')
					{
						down[count] = GET_CHAR(j,col+k+1)*100 + GET_CHAR(j,col+k+2);
						goto ENDLOOP2;
					}

					key = GET_CHAR(j,col-k);
					if (key == '~')
					{
						down[count] = GET_CHAR(j,col-k+1)*100 + GET_CHAR(j,col-k+2);
						goto ENDLOOP2;
					}
				}
			} ENDLOOP2:;
			count++;
		}   //end of if block
	}      //end of for loop

	/********** blank the fields **************/

	count =0;
	for(i=0,tempPtr=imagePtr ; i<3840 ; i+=2,tempPtr+=2)
	{
		if (*tempPtr == '~')
		{
			j = editField[count++]->getLen();

			if (j<3) j=3; // take care of small fields

			for(k=0;k<j;k++)
				*(tempPtr+k*2) = 32;
		}  //endif
		}     //end for
}        //end function

void DataScreen::display()
{
	short i;
    char far *scrnPtr, *tPtr;

	scrnPtr = screen;
	tPtr = imagePtr;

	for(i=0;i<3840;i++)
		*(scrnPtr++) = *(tPtr++);
}

void DataScreen::save()
{
	short i;
    char far *scrnPtr,*tPtr;

	scrnPtr = screen;
	tPtr = imagePtr;

	for(i=0;i<3840;i++)
		*(tPtr++) = *(scrnPtr++);
}


short DataScreen::edit()
{
	short i,key;

	for(;;)
	{
		START: key = editField[selector]->putField();
		switch(key)
		{
			case -1:
				return (-1);
			case UP:
				selector = ((up[selector] >=0)&&(up[selector]<=max))? up[selector]: selector;
				break;
			case DOWN:
				selector = ((down[selector] >=0)&&(down[selector]<=max))? down[selector]: selector;
				break;
			case LEFT:
				selector = ((left[selector] >=0)&&(left[selector]<=max))? left[selector]: selector;
				break;
			case RIGHT:
				selector = ((right[selector] >=0)&&(left[selector]<=max))? right[selector]: selector;
				break;
			default: // check for hot keys
				for(i=0;i<max;i++)
				{
					if(key == altKey[hotKey[i]-97])
					{
						selector = i;
						goto START;
					}
				}
				return(key);
		}
	}
}

int DataScreen::getDataSize()
{
	int i,sum=0;

	for (i=0;i<max;i++)
		sum += editField[i]->getLen()+1;

	return sum;
}

void DataScreen::getData(DataSet *set)
{
   int i;

   for (i=0;i<max;i++)
	 editField[i]->putString(set->readAddr(i));
}


DataScreen::~DataScreen()
{
  short i;
  for (i=0;i<max;i++)
	delete editField[i];

	delete [3840]imagePtr;
	delete [max]editField;
	delete [max]up;
	delete [max]down;
	delete [max]left;
	delete [max]right;
	delete [max]hotKey;
}



/************************ FIELD MEMBERS ****************************/

void Field::putString(const char *inString)
{
	char count=0;

    char far *screenPosition = screen + row*160 +column*2;

	clear(offAtt); // blank field

	while(*(inString))
	{
	  *(screenPosition++) = *(inString++); // put character
	  *(screenPosition++) = offAtt;   // put off attribute
	  if (++count==length) break;
	}
}

void Field::clear(char att)  // blank field
{
	short i;
    char far *screenPosition = screen + row*160 +column*2;

	for(i=0;i<length;i++)
	{
	  *(screenPosition++) = 32;        // put blank
	  *(screenPosition++) = att;   // put off attribute
	}
}

char* Field::getString(char *outString)   // get string at field
{
	short i = length;
    char far *screenPosition = screen + row*160 +column*2;

	while(*(screenPosition)&&(i--)) // stop at 1st Null or end of Field
	{
	  *(outString++) = *(screenPosition); //get char, skip attribute
	  screenPosition +=2;
	}
	*(outString)=0;               //add Null to end
	return(outString);
}

short Field::putField()
{
	char key;
	short tempLength=0, tempRow,tempCol,i;

	for(i=0;i<length;i++)
		PUT_AT(row,column+i,onAtt)

	SET_CURSOR(row,column)
	for(;;)
	{
		key=getch();
		if (!key)
		{
			key = getch();
			for(i=0;i<length;i++)
				PUT_AT(row,column+i,offAtt)
			verify();
			return(key);
		}

		switch(key)
		{
			case ENTER:
				for(i=0;i<length;i++)
				PUT_AT(row,column+i,offAtt)
				verify();
				return DOWN;
			case ESC:
				for(i=0;i<length;i++)
					PUT_AT(row,column+i,offAtt)
				verify();
				return(-1);
			case BS:
				if(tempLength>0)
				{
					tempLength--;
					tempCol--;
					PUT_CHAT(tempRow,tempCol,32,onAtt)
					SET_CURSOR(tempRow,tempCol);
				}
				break;
			default:
				if(key<32) break;
				if (tempLength < length)
				{
					tempLength++;
					PUT_CHAT(tempRow,tempCol,key,onAtt)
					tempCol++;
					SET_CURSOR(tempRow,tempCol);
				}
		}
	}/* end of for loop*/
}

/***************** DataSet Members *******************************/
char *DataSet::getAddr(int elt)
{
	int i;
	char *temp = data;

	if (elt >= numElts) error("Out of range on getAddr!\n");

	for(i=0;i<elt;i++)
	   temp += length[i];

    return temp;
}

char *DataSet::readAddr(int elt)
{
	int i;
	char *temp = data;

	if (elt >= numElts) error("Out of range on getAddr!\n");

	for(i=0;i<elt;i++)
	   temp += length[i];

    return temp;
}


DataSet::DataSet(int totSize)
{
	CHECK( data = new(char[totSize]));
    size = totSize;
}

DataSet::DataSet(DataScreen *screen)
{
	int i;
	Field **fields = screen->getField();
	char *dataTmp,fieldStr;

	size = screen->getDataSize();
	numElts = screen->getMax();


	CHECK( dataTmp = data = new char[size+numElts]);
	CHECK( length = new int[numElts]);

	for (i=0;i<numElts;i++)
	{
		fields[i]->getString(dataTmp);
		dataTmp+=fields[i]->getLen()+1;
		length[i] = fields[i]->getLen()+1;
	}
}

void DataSet::getDataScreen(DataScreen *screen)
{
	int i;
	Field **fields = screen->getField();
	char *dataTmp,fieldStr;
	dataTmp = data;

	for (i=0;i<numElts;i++)
	{
		fields[i]->getString(dataTmp);
		dataTmp+=fields[i]->getLen()+1;
		length[i] = fields[i]->getLen()+1;
	}
}


DataSet::~DataSet()
{
	delete [size]data;
	delete [numElts]length;
}

char *DataSet::fetchData(char *dest, int elt)
{
	strncpy( dest, getAddr(elt), length[elt]);
	return dest;
}

const char *DataSet::putData(const char *source, int elt)
{
	strncpy(getAddr(elt), source, length[elt]);
	return source;
}

int DataSet::putInt(int n, int elt)
{
	char buffer[12];
   itoa(n,buffer,10);
	strncpy(getAddr(elt), buffer, length[elt]);
   return n;
}

int DataSet::saveData(FILE *fileptr, int record)
{
	long i;
	char *temp=data;

	if(fseek(fileptr,(long) record*size, 0)) return 0; // check for error

	for (i=0;i<size+numElts;i++)
		fputc(*(temp++),fileptr);

	return 1;
}

int DataSet::restoreData(FILE *fileptr, int record)
{
	long i;
	char *temp=data;

	if(fseek(fileptr,(long) record*size, 0)) return 0; // check for error

	for (i=0;i<size+numElts;i++)
		*(temp++) = fgetc(fileptr);

	return 1;
}
