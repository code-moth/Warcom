//
#include <string.h>
#include <conio.h>
#include "editkeys.hpp"
#include "window.hpp"

extern int numWeap;
extern char *weapName(int i);

int weaponSearch_unitscrn()
{
	point ul,lr;
	lr.row = 21; lr.col = 32; ul.row = 1; ul.col = 3;
	List list( weapName, numWeap, ul, lr);
	return list.get();
}
