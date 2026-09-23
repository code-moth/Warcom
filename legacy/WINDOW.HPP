//Q‰

// window.hpp -- prototypes for window class

#define SET_CURSOR(x,y) gotoxy(((y)+1),((x)+1)); tempRow = x; tempCol = y;
#define PUT_CHAT(row,col,c,a) *(screen+(row)*160+(col)*2) = (c);*(screen+(row)*160+(col)*2+1) = (a);
#define PUT_AT(row,col,a) *(screen+(row)*160+(col)*2+1) = (a);
#define GET_CHAR(row,col) *(screen+(row)*160+(col)*2)
#define PUT_CHAR(row,col,c) *(screen+(row)*160+(col)*2) = (c)
#define SCR_PTR(row,col) screen+(row)*160+(col)*2
#define max(a,b) ((a)>(b))?(a):(b)
#define min(a,b) ((a)<(b))?(a):(b)

typedef char *(*ITEM)(int);

struct point
{
	char row;
	char col;
};

char *putString(char *inStr, point &pt, int length, int swap);

class List
{
	ITEM item;
	int max, itop, select;
	point ul,lr;

	public:

	List( ITEM item1, int max1, point &ul1, point &lr1)
	{
		item = item1; max = max1;
		ul.col = ul1.col; ul.row = ul1.row;
		lr.col = lr1.col; lr.row = lr1.row;
		itop = 0; select = 0;
	}

	int get(void);

	void show(void);
};

char *item1(int i);





/*
struct color
{
	unsigned char fore : 4;
	unsigned char back : 4;
};

union attByte
{
	color col;
	unsigned char att;
};


struct winFlag
{
	int active : 1;
	int hidden : 1;
	int save   : 1;
    int shadow : 1;
};

struct windowData
{
	point topLeft, bottomRight;
	color border, text, select;
	char *image;
	winFlag flag;
}	

class Window
{
	point topLeft, bottomRight;
	color border, text, select;
	char *image;
	winFlag flag;

	public:

	window(char row1, char col1, char row2, char col2, char fore, char back)
	{
	   topLeft.row = row1; topLeft.col = col1;
	   bottomRight.row = row2; bottomRight.col = col2;
	   text.fore = fore; text.back = back;
	}

	windowData *data(void)
	{
		return (* const windowData) &topLeft;
	}
};


*/