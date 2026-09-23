void error(char *message);

class DataSet;

class Field
{
	char onAtt, offAtt;
	short row,column,length;

	public:

	Field(){}

	Field(short r, short c, short l, char on=31, char off=7)
	{ row = r; column = c; length=l; onAtt=on; offAtt=off;}

	void init(short r, short c, short l, char on=31, char off=7)
	{ row = r; column = c; length=l; onAtt=on; offAtt=off;}

	void clear(char att);  // blank field
	char* getString(char *outString);
	void putString(const char *inString); //put string to field
	short putField();
	short getLen() { return(length); }
	void verify(){;}
};


class DataScreen
{
	char  *hotKey, *imagePtr;
	short selector, max, *up, *down, *left, *right;
	Field **editField;

	public:

	DataScreen(char *imageFile);
	~DataScreen();
	void display();
	void save();
	short edit();
	void getData(DataSet *set);
	int getMax(){return max;}
	Field **getField() {return editField;}
	int getDataSize();
};

class DataSet
{
	int numElts;
	int size;
	int *length;
	char *data;

	char *getAddr(int elt);

	public:

	int elts() { return numElts;}
        char *readAddr(int elt);
	DataSet(int totSize);
	DataSet(DataScreen *screen);
	~DataSet();
	char *fetchData(char *dest, int elt);
	const char *putData(const char *source, int elt);
   int putInt(int n, int elt);
	void getDataScreen(DataScreen *scrn);
	int saveData(FILE *fileptr, int record);
	int restoreData(FILE *fileptr, int record);
   void clear() {	memset(data,0,size); }
   int getSize() {return size;}
};
