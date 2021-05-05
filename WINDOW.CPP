//
#include <string.h>
#include <conio.h>
#include "editkeys.hpp"
#include "window.hpp"

extern char far *screen;


char *putString(char *inStr, point &pt, int length, int swap)
{
	int i;
    char far *tempPtr = SCR_PTR(pt.row,pt.col);
	char *tStr = inStr;
	char inChar, color;

	color = *(tempPtr+1); // read in color
	color = (color%16)*16 + color/16; // ONLY works with foregrounds <8

	for (i=0;i<length;i++) // clear the current entry
	{
	   *tempPtr = ' ';
	   *(tempPtr++);
	   if (swap) *tempPtr = color;
	   tempPtr++;
	}

	tempPtr = SCR_PTR(pt.row,pt.col);
	for (i=0;i<length;i++) // write chars until end of string or NULL
	{
		if (!(inChar = *(tStr++))) break; // break on NULL
		*tempPtr = inChar;
		tempPtr+=2;
	}
	return inStr;
}

int List::get(void)
{
	int length = lr.col - ul.col + 1;
	int height = lr.row - ul.row + 1;
	int key;

	point p;
	p.col = ul.col;
	p.row = ul.row;

    _setcursortype(_NOCURSOR); //turn off cursor

	show();

	key = getch();
	for(;;)
	{
		p.row = ul.row - itop + select;
		putString(item(select),p,length,1);

		switch(key)
		{
			  case 0: key = getch();
				switch(key)
				{
					case UP: select = max(select-1,0);
						 if (select < itop) itop = select;
						 break;

					case DOWN: select = min(select+1,max-1);
						   if (select > itop+height-1) itop++;
						   break;

					default:
                    _setcursortype(_NORMALCURSOR); //turn on cursor
					return -key;
				}
				break;

              case ENTER: _setcursortype(_NORMALCURSOR); //turn on cursor
            			  return select;

			  default:
              _setcursortype(_NORMALCURSOR); //turn on cursor
			  return -key;
		}
		show();
		key = getch();
	}
}

void List::show(void)
{
  	int length = lr.col - ul.col + 1;
	int height = lr.row - ul.row + 1;
	int i,j;
	point p;
	p.col = ul.col;
	p.row = ul.row;

	for(i=0;i<height;i++)
	{
		j = itop + i;

		if (j>=max)
			putString(" ", p, length, 0);
		else
			if (j == select)
				putString((*item)(j), p, length, 1);
			else
				putString((*item)(j), p, length, 0);
		p.row++;

	}
}


