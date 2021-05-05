const char *putStr(const char *inStr, int row, int col, int length, char color);
int message(char *msg, int flag);
void attack(DataScreen &screen, DataSet **set1, DataSet **set2);
void showUnits(int start, DataSet **set1, DataSet **set2);
void killNull(char * string, int length);
int checkStatus(DataSet **set2, int unit);
void resolve(DataSet *attackSet, DataSet **unitSet,int flag);
int getWeap(DataSet *attackSet, DataSet **unitSet);
void initWeap();
char *crToNull(char *str,int n);
int num(DataSet *data, int field, int min, int max);
int compare(const char *str1, const char *str2);
int dieRoll(void);       // Legacy dieRoll() refers to dieRoll_OE
int dieRoll_OE(void);    // Default dieRoll() is open ended low and high
int dieRoll_OEL(void);   // Only open-ended on the low side
int dieRoll_OEH(void);   // Only open-ended on the high side
int dieRoll_flat(void);  // Straight 1-100 roll
void showTxtFile(char* fname);
int weaponSearch();
char *weapName(int i);


#define U_NAME   0
#define U_RACE   1
#define U_TYPE   2
#define U_WEAPON 3
#define U_AT     4
#define U_DIS    5
#define U_MC     6
#define U_FORM   7
#define U_MR_S   8
#define U_MR_N   9
#define U_MR_M   10
#define U_OB_S   11
#define U_OB_N   12
#define U_OB_M   13
#define U_DB_S   14
#define U_DB_N   15
#define U_DB_M   16
#define U_EX_S   17
#define U_EX_N   18
#define U_EX_M   19
#define U_MV_S   20
#define U_MV_N   21
#define U_MV_M   22
#define U_NM_S   23
#define U_NM_N   24
#define U_HT_S   25
#define U_HT_N   26
#define STAT_ELEMENTS 27

#define A_ATT    0
#define A_NATT   1
#define A_DEF    2
#define A_NDEF   3
#define A_MOD    4
#define A_DMX    5
#define A_SPCR   6
#define A_WEAPON 7
#define ATTACK_ELEMENTS 8

#define UNIT(arg1,arg2) set1[(arg1)]->readAddr(arg2)
#define ATTACK(arg1,arg2) set2[(arg1)]->readAddr(arg2)

#define NAN -1000
#define NO_ATTACKER -1
#define NO_WEAPON -2

#define MAX_NUMBER_OF_UNITS 200
