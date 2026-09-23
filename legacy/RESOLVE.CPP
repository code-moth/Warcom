#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <math.h>     // Needed for gaussian # generator's sqrt and log

#include "datascrn.hpp"
#include "test.hpp"
#include "window.hpp"

// #defines for ran0
#define IA 16807
#define IM 2147483647
#define AM (1.0/IM)
#define IQ 127773
#define IR 2836
#define MASK 123459876
// Additional #defines for ran1
#define NTAB 32
#define NDIV (1+(IM-1)/NTAB)
#define EPS 1.2e-7
#define RNMX (1.0-EPS)

#define CHECK(expr) if(!(expr)) error("Memory allocation error.")
#define W(arg1,arg2) weapon[(arg1)]->AT[(arg2)]
#define MAX_NUMBER_OF_WEAPONS 100

extern signed long nGenerate;    // Declared in Test.cpp, initialized at beginning of main()
float ran1(long *idum);          // Prototype for ran1 (near bottom) so function resolve() can see it.
extern int logfile ;               //  Sets to one if command line requests BATTLE.LOG appended records.
extern FILE *logfileptr;


struct ArmorType            // Data column for a weapon table at a specific armor type.
{
    unsigned char max;      // Max damage level @ 150
    unsigned char start;    // Level @ which damage becomes nonzero (near bottom of chart)
    unsigned char min;      // Minimum damage level (points dam @ 'start')
    unsigned char crit[5];  // E,D,C,B,A thresholds (declining order of severity)
};

struct Weapon               // A weapon table is made up of twenty ArmorType columns (above)
{                           //    and has up to a 30-char name.
    char name[30];
	ArmorType AT[20];
};

// Prototype for local-scope function
static float defineRandomGuyHits(int orig_N, int current_N, float agg_hits, float max_hits);

Weapon **weapon;
int  numWeap;
extern DataSet *tempData;
const int numUnits = MAX_NUMBER_OF_UNITS;
extern int restrict;

void initWeap() // look up weapons and make list
{
   FILE *weapFile;
   int i,j,t1,t2,t3;

   weapFile = fopen("weapons.dat","rb");
   if (!weapFile)
   {
       message("WEAPONS.DAT -- file not found.",0);
       exit(0);
   }

   CHECK(weapon = new Weapon*[MAX_NUMBER_OF_WEAPONS]); // max of 100 weapons

   numWeap = -1;
   while(!feof(weapFile))
   {
      while(fgetc(weapFile)!='%')
          {
          if (feof(weapFile))
              {
              fclose(weapFile);
              return;
              }
          }

      numWeap++;
      CHECK(weapon[numWeap]=new Weapon);           // Create block of memory for this weapon

      fgets(weapon[numWeap]->name,30,weapFile);    // Read in weapon name
      crToNull(weapon[numWeap]->name,30);          // Append null to weapon name string

      while(fgetc(weapFile)!='%'){;}               // Read & discard leading '%' char

      for (i=19;i>=0;i--)                          // 19 = AT20 ; 0 = AT1
      {                                            // Weapons.dat tables read from high AT to low AT
	      fscanf(weapFile,"%i,%i,%i,",&t1,&t2,&t3);
          W(numWeap,i).max = t1;                   // Read max, start, min for this AT
          W(numWeap,i).start = t2;
          W(numWeap,i).min = t3;
          for (j=0;j<5;j++)                        // Read the five critical thresholds E..A
          {
              fscanf(weapFile,"%i,",&t1);
              W(numWeap,i).crit[j] = t1;
          }
      }
   }
   fclose(weapFile);
}


// Returns integer representing the weapon to be used during this Attack #
int getWeap(DataSet *attackSet, DataSet **unitSet)
{
   // get attacker's number
   int a,i;
   char buffer[80];

   if ((a = num(attackSet,A_ATT,1,numUnits)) == NAN)
      return NO_ATTACKER;
   a--;                                            // Convert attacker # into corresponding array index

   // check weapon list for attack specified weapon (overrides a weapon specified for the unit)
   for (i=0;i<numWeap;i++)
    {
     	if (compare(weapon[i]->name,attackSet->readAddr(A_WEAPON)))
      	return i;
    }

   // check list for unit specified weapon (default if no attack-specific weapon specified)
   for (i=0;i<numWeap;i++)
    {
     	if (compare(weapon[i]->name,unitSet[a]->readAddr(U_WEAPON)))
      	return i;
    }

   // No legitimate weapon defined for attack.  Show error message.
   sprintf(buffer,"Bad weapon for unit %i: %s. Hit a key.",a+1,unitSet[a]->readAddr(U_WEAPON));
   message(buffer,1);
   message(" ",0);
   return NO_WEAPON;
}

// Iterate thru combat involving one pair of attacking/defending units.
void resolve(DataSet *attackSet, DataSet **unitSet, int flag)
{
   long attUnit[STAT_ELEMENTS],att[ATTACK_ELEMENTS],defUnit[STAT_ELEMENTS];
   int concDamX ;   // Concussion damage multiplier for attack, from attackSet->readAddr(A_DMX)
   int spCritIdx ;  // Special crit index.  An integer derived from attackSet->readAddr(A_SPCR)
   char critChar ;  // Character corresponding to spCritIdx above
   float critCasualtyP_float ;  // Probability of a crit casualty based on attack type, crit severity,
   int critCasualtyP_percent ;  //   and target type.  Computed in float but then converted to int %.
   long i,j,w,a,d,mod,roll,at,hitSave,mr,ex;
   int hits_whole, hits_frac, rounding_roll; // Integers for use in computing rounding for new unit hits avg
   // Casualty probabilities for critical levels E..A for various target types.  A 'casualty' does not
   //    always mean death.  In mass-combat terms, the casualty is simply no longer an effective combatant.
   // NOTE 11  ----------------
   //    Adding feature where attack circumstances may cause attacker group to do a special critical
   //    class (e.g. using kata, using magic weapons, in Holy place, etc.).
   int critTable[7][5] = {
        {90,75,60,45,30},   // "small" or tiny targets.  Much more vulnerable.
        {60,50,40,30,20},   // Normal, humanoid type targets.  Standard casualty rates on critical hits.
        {50,40,30,20, 2},   // Type I, downgrade criticals by one grade vs. these targets (A -20).
        {40,30,20, 5, 1},   // Type II, downgrade criticals by two classes (B -20, A -40).
        { 8, 8, 8, 8, 0},   // Large targets.  Large creature table, rolled on B results and above.
        { 2, 2, 0, 0, 0},   // Super-large targets.  SL creature table, applied only on D & E results.
        {40,30,20,15, 5}    // "nostun"  Otherwise normal target that doesn't suffer stun results.
        };
   int magicCritTable[7][5] = {
        {90,75,60,45,30},   // "small" or tiny targets.  SAME
        {60,50,40,30,20},   // Normal, humanoid type targets.  SAME
        {50,40,30,20, 2},   // Type I  SAME
        {40,30,20, 5, 1},   // Type II  SAME
        {11,11,11,11, 0},   // Large targets.  "Magic" column casualty rate
        { 2, 2, 0, 0, 0},   // Super-large targets.  "Magic" column casualty rate
        {40,30,20,15, 5}    // "nostun"  SAME
        };
   int holyCritTable[7][5] = {
        {90,75,60,45,30},   // "small" or tiny targets.
        {36,36,36,36,36},   // Normal.  Using holy gives lower rate for 'E' & 'D', but more damage overall.
        {36,36,36,36,36},   // Type I  Holy casualty rate & damage is generally advantageous.
        {36,36,36,36,36},   // Type II  Holy casualty rate & damage is generally advantageous.
        {36,36,36,36, 0},   // Large targets.  "Holy" column casualty rate is quite high.
        {24,24, 0, 0, 0},   // Super-large targets.  Wow.
        {36,36,36,36,36}    // "nostun"
        };
   int slayCritTable[7][5] = {
        {37,37,37,37,37},   // "small" or tiny targets.  Combine this result and critTable result.
        {37,37,37,37,37},   // Normal, humanoid type targets.  Combine this result and critTable result.
        {37,37,37,37,37},   // Type I  Combine this result and critTable result.
        {37,37,37,37,37},   // Type II  Combine this result and critTable result.
        {37,37,37,37, 0},   // Large targets.  "Slaying" column casualty rate
        {31,31, 0, 0, 0},   // Super-large targets.
        {37,37,37,37,37}    // "nostun"  Combine this result and critTable result.
        };
   // SizeMod used to be a float factor.  Now it's a second index into the critTable of casualty rates.
   // (see NOTE 9, below).
   int sizeMod;
   // If a given critical does *not* result in a casualty, some # of hits will be assessed against the
   //    defending unit's aggregate regardless.  This should reflect an average # of hits for such critical
   //    excluding the explicitly debilitating results.
   // As per NOTE 3 and other notes, the added critical damage can contribute to a high hit-point type
   //    of casualty.
   // As per NOTE 9, this is being updated to a two-dimensional array so that large and super-large
   //    hit results are probablistically more accurate.  For example, added hits on the L & SL tables
   //    are typically significantly higher, but are +0 if Large result is 'A' or SL result is not 'D'
   //    or 'E'.
   int critDam[7][5] = {
        {15,12, 9, 7, 4},   // "small" or tiny targets.  Same damage scale.
        {15,12, 9, 7, 4},   // Normal, humanoid type targets.  Standard damages on critical hits.
        {12, 9, 7, 4, 2},   // Type I, downgrade criticals by one grade vs. these targets (A -20).
        { 9, 7, 4, 3, 1},   // Type II, downgrade criticals by two classes (B -20, A -40).
        {20,20,20,20, 0},   // Large targets.  Large creature table, rolled on B results and above.
        { 9, 9, 0, 0, 0},   // Super-large targets.  SL creature table, applied only on D & E results.
        {15,12, 9, 7, 4}    // "nostun"  Added damages are the same as for normal targets.
        };
   int magicCritDam[7][5] = {
        {15,12, 9, 7, 4},   // "small" or tiny targets.  Same damage scale as "normal"
        {15,12, 9, 7, 4},   // Normal, humanoid type targets.  Crit damage doesn't change for "magic"
        {12, 9, 7, 4, 2},   // Type I   Unchanged for "magic"
        { 9, 7, 4, 3, 1},   // Type II  Unchanged for "magic"
        {22,22,22,22, 0},   // Large targets.  Crit damage is just slightly higher on avg in "magic" column
        {11,11, 0, 0, 0},   // Super-large targets.  Crit damage is slightly higher in "magic" column
        {15,12, 9, 7, 4}    // "nostun"  Crit damage doesn't change for "magic"
        };
   int holyCritDam[7][5] = {
        {20,20,20,20,20},   // "small" or tiny targets.  Roll damage as 'Large' Holy column
        {20,20,20,20,20},   // Normal, humanoid type targets.  Roll damage as 'Large' Holy column
        {20,20,20,20,18},   // Type I   Roll damage as 'Large' Holy column, with minus for 'A'
        {20,20,20,18,15},   // Type II  Roll damage as 'Large' Holy column, with minuses for 'A' and 'B'
        {22,22,22,22, 0},   // Large targets.  Crit damage from "Holy" column is same on avg as "magic"
        {17,17, 0, 0, 0},   // Super-large targets.  Crit damage is considerably higher in "Holy" column
        {20,20,20,20,20}    // "nostun"  Roll damage as 'Large' Holy column
        };
   int slayCritDam[7][5] = {
        {23,23,23,23,23},   // "small" or tiny targets.  Damage as L Slay all the way across, plus
        {23,23,23,23,23},   // Normal, humanoid type targets.  Damage as L Slay all the way across, plus
        {23,23,23,23,23},   // Type I   Damage as L Slay all the way across, plus
        {23,23,23,23,23},   // Type II  Damage as L Slay all the way across, plus
        {23,23,23,23, 0},   // Large targets.
        {25,25, 0, 0, 0},   // Super-large targets.  Best damage column.
        {23,23,23,23,23}    // "nostun"  Damage as L Slay all the way across, plus
        };
   // NOTE 10 -- Randomize the critical damage somewhat.  Now I realize that the critical damage done
   //   and the incidence of critical casualties in actual gameplay are correlated, but this is not
   //   terribly important to the mass combat evaluation and will be left independent.  The const
   //   below is applied to a uniformly distributed random number in the range (0,1) to yield a factor
   //   with range (0,1.50), which is the multiplier for the critDam table lookup.  This will better
   //   approximate the variability of the added damage results experienced in the real game.
   const float critDamSpread = 1.50 ;
   long numAtt,numDef,numDefSave;
   FILE *file;
   float slope,hits,numPer,hitPer;
   long casualties, aggDam ; // for BATTLE.LOG only
   float thisAttackDamage;  // Added temp variable so single attack can be evaluated to see whether there's
                            //    enough damage from it to guarantee the casualty on damage alone.
   const char *tempChar;
   // Boolean variables that flag why a defender is being removed as a casualty.  (Originally, casualties
   //    were *only* crit-based).  A 'maxHitsCasualty' occurs when a single attack's damage (table
   //    concussion plus critical) exceeds the defender unit's *starting* per-member hits.  A
   //    'highHitsCasualty' is a probabilistic casualty invoked when the single attack's damage exceeds
   //    the defending unit's *current* per-member hits but does not attain maxHits level.
   int critCasualty, maxHitsCasualty, highHitsCasualty ;
   // If one attack does damage exceeding the defending unit member's mean hits, there's a possibility
   //    that the specific guy hit might have been one of the wounded and is thus "out of hit points"
   //    and becomes a casualty.  This var stores THAT GUY's hit points.
   float statisticalRandomTargHits ;
   int guysStanding;
   float avgHitsGuysStanding;

    // get attacker's number, convert to array index
   if ((a = num(attackSet,A_ATT,1,numUnits)) == NAN)
       return;                                      // Terminate resolution if attacker undefined
   a--;

   // get defender's number, convert to array index
   if ((d = num(attackSet,A_DEF,1,numUnits)) == NAN)
       return;
   d--;

   //load up tempData
   // I assume that when doing an entire battle of N attacks, for each attack we load from the original
   //    force array so that the order of attacks in the battle file is not prejudicial to the outcome.
   if (flag)
   {
       file = fopen("backup.unt","rb");
       tempData->restoreData(file,a);
       fclose(file);
   }
   else
       memcpy(tempData->readAddr(0),unitSet[a]->readAddr(0),tempData->getSize());

   // Get weapon.  One weapon will be used uniformly in this unit-on-unit attack.
   w = getWeap(attackSet,unitSet);

   // Convert stats and attack elements to integer equivalents.  The enumerations are found in
   // main header file (test.hpp).
   for(i=0; i<STAT_ELEMENTS; i++)
   {
       if (i < ATTACK_ELEMENTS) att[i] = num(attackSet,i,-9999,9999);
       attUnit[i] = num(tempData,i,-9999,9999);
       defUnit[i] = num(unitSet[d],i,-9999,9999);
   }

   // generate number of attackers.
   // Go to the attack set and get the number that was specified for the attacking unit.
   j=num(attackSet,A_NATT,0,9999);

   // If the number was not specified, the implication is that all will attack once each.
   // Thus the numAtt is the number of attackers in the unit now (Unit Number of Men Now).
   if (j==0)  numAtt = attUnit[U_NM_N];
   // If the number is somehow negative, this is an error.
   else if (j < 0) return;   // An error
   else  // the number of attackers is positive
       {
       // A positive number might be specified as an absolute number of attacks or as a percentage
       //    of the number of attackers currently in the unit.  Must go to the attack set string
       //    to know whether it was spec'ced as a percentage.
       // A truncation down to zero is bumped to one attack (Version 2.3)
       if (strchr(attackSet->readAddr(A_NATT),'%'))
           {
           numAtt = ((attUnit[U_NM_N])*j)/100L;  // Note integer rounding.
           if ((attUnit[U_NM_N] > 0) && (numAtt == 0))  numAtt = 1;
           }
       else
           numAtt = j;   // Not a percentage.  Attacks specified as absolute number.
       }
   // After all that, *still* should address the issue of an attacking unit that was actually wiped
   //    out in a previous iteration (& not noticed), yet is still spec'ced an absolute # of attacks.
   //    If this is the case, zero the numAtt and abort this nonexistent "attack".  (Version 2.3)
   if (!(attUnit[U_NM_N]))
   {
       numAtt = 0 ;
       return ;
   }

   // generate number of defenders
   j=num(attackSet,A_NDEF,0,9999);

   // By default assume that all members still in the unit are defenders.
   if (j==0) numDef = defUnit[U_NM_N];
   else if (j < 0) return;  // An error
   else
       {
       // Positive number is either an absolute number or a percentage of the current manpower.  Must
       //    examine the string to see if a %tage was specified.
       if (strchr(attackSet->readAddr(A_NDEF),'%'))
           numDef = ((defUnit[U_NM_N])*j)/100L;
       else
           numDef = j;
       }
   // Cannot allow the number of defenders to exceed the actual targets in the unit regardless.
   if (numDef > defUnit[U_NM_N])   numDef = defUnit[U_NM_N];
   // The following is for the algorithm.  If there are not enough attacks to go around, cap the
   //    number of defenders at the number of attacks.  Only this # of targets in the defending unit
   //    can be affected then, which is important in aggregate / average hit points resolution.
   if (numDef > numAtt)   numDef = numAtt;

   if (!numDef) return; // make sure someone's home.  If this somehow rounded to zero defenders, abort.
   numDefSave = numDef; // Remember pre-attack # of defenders

   // compute sizeMod
   // Sizemod is used to increase or decrease the relative lethality of criticals.
   // NOTE 9 -- sizeMod used to be a blanket probability factor applied to the crit casualty probability
   //   to get an aggregate (product) probability.  It is smarter, and about equally easy, to just have
   //   sizeMod be a separate array index and then have a two-dimensional table lookup.  It is then a
   //   more realistic result:  For example, consider a C critical on a super-large target.  The previous
   //   casualty rate was 8 percent.  The realistic crit casualty rate is zero percent, since only D or E
   //   results get to roll a crit vs. SL targets.
   tempChar = unitSet[d]->readAddr(U_TYPE); // read type
   if (compare(tempChar,"small"))  // Crits vs. 'small' targets are thought, on average, to be 50% deadlier
      sizeMod =  0;               //    than against 'normal' targets.
   // Increasingly larger or enchanted targets are less and less vulnerable to critical strikes.
   else if ((compare(tempChar,"type i")) || (compare(tempChar,"i")))  // Substrings won't match
      sizeMod =  2;
   else if ((compare(tempChar,"type ii")) || (compare(tempChar,"ii")))
      sizeMod =  3;
   else if (compare(tempChar,"large"))
      sizeMod =  4;
   // Allow for hyphenated & non-hyphenated "super large"
   else if ((compare(tempChar,"super-large")) || (compare(tempChar,"super large")) || (compare(tempChar,"super")))
      sizeMod =  5;
   else if (compare(tempChar,"no stun"))  // blanks are ignored by this string compare ( == "nostun")
      sizeMod =  6;
   else               // An unspecified target type defaults to 'normal' critical row
      sizeMod =  1;
   // Get concDamX (concussion damage multiplier) set.
   tempChar = attackSet->readAddr(A_DMX);   // read character (string)
   if ((att[A_DMX] >= 1) && (att[A_DMX] <= 9))
       concDamX = att[A_DMX] ;
   else if ((compare(tempChar,"0")) || (compare(tempChar,"o")) || (compare(tempChar,"O")))
       concDamX = 0 ;
   else concDamX = 1 ;
   // Get spCritIdx (special attack critical index) set.
   tempChar = attackSet->readAddr(A_SPCR);   // read character (string)
   critChar = tempChar[0];                   // put first character in non-const variable
   critChar = tolower(critChar);             // convert to lower case
   if (critChar == 'd')          // double independent criticals of same degree
       spCritIdx = 1 ;
   else if (critChar == 'k')     // kata crit; second crit is same roll, one degree less
       spCritIdx = 2 ;
   else if (critChar == 'm')     // use magic column on L, SL
       spCritIdx = 3 ;
   else if (critChar == 'h')     // use holy column on L, SL and on man-sized targets too
       spCritIdx = 4 ;
   else if (critChar == 's')     // use slay column on L, SL and in addition to normal man crits
       spCritIdx = 5 ;
   else spCritIdx = 0 ;

   // compute #hits
   // Only the defending unit's hits are at issue during an attack resolution.  Assess hits as a unit
   //    total.  Multiply the number of defenders (the actual number subject to attack) by Unit HiTs Now
   //    (average per-target at start of round).
   hitSave = hits = defUnit[U_HT_N]*numDef;

   // calculate die roll modifier
   // Takes into account attacking Unit OB Now, attacking Unit OB Modifier, defending Unit DB Now,
   //    defending Unit DB Modifier and the current Attack MODifier.
   mod = attUnit[U_OB_N] + attUnit[U_OB_M] - defUnit[U_DB_N] - defUnit[U_DB_M] + att[A_MOD];

   // get AT of defenders
   at = defUnit[U_AT];
   if ((at<0)||(at>19))   at = 0;  // An unspecified AT is assumed to be "no armor", i.e. AT 1

   // Calculate slope for hits determination @ weapon & AT  --  d(damage) / d(roll)
   slope = ((float)(weapon[w]->AT[at].max - weapon[w]->AT[at].min))/((float)(150-weapon[w]->AT[at].start));

   // do battle...
   // Iterate through every attack of attacker on defender
   for(i=0; i<numAtt; i++)
   {
       critCasualty = 0;       // Initialize the booleans that flag the casualty types.  In original
       maxHitsCasualty = 0;    //    warcom version, all casualties were critCasualty result.
       highHitsCasualty = 0;
       // If the total attack roll doesn't even make it onto the attack table, skip to next attack.
       if ( (roll = dieRoll_OE() + mod) < (weapon[w]->AT[at].start) )  continue;
       // dieRoll(), incidentally, is an open-ended on both ends roll (high and low).  It's not an
       //    OEH-with-fumble roll like "real" I.C.E. attacks -- but for mass combat this is acceptable.
       if (roll > 150)  roll = 150;    // Cap attack at the top of the chart.
       // Compute damage from this attack.
       //    In this new version, wait to deduct from the aggregate defending hit points.  If this one
       //    attack for example far exceeds the hits for a healthy target, it's unrealistic to deduct
       //    the full damage from the unit.  Also gives opportunity to accrue hits from strike & crit
       //    to see if hits alone will guarantee a casualty.
       // NOTE 12 -----------------
       //    Added new field in attack screen: the concussion hits damage multiplier (e.g. for giant
       //    attackers, drugged attackers, monk teams).
       thisAttackDamage = (slope*(roll-150) + weapon[w]->AT[at].max)*concDamX ;
       // NOTE 3 ----- NOW RESOLVED below
       // Some realistic modifications:  If the damage for a single attack exceeds the *original*
       // per-member hit points, this should result in a casualty (and critical resolution bypassed).
       // Furthermore, if this # of hit points plus non-casualty critical hit points should exceed
       // original per-member hit points, that becomes a casualty then too.  Lastly, the hit points
       // taken off the aggregate of the defenders for one attack should not exceed original per-member #.

       // criticals
       for(j=0;j<5;j++)
       {   // Check for criticals one at a time, starting at 'E' and working down.  If we find that
           //    we've affirmed and assessed the proper critical, we can abort the remaining iterations.
           // Some critical levels do not exist for some weapons at certain armor types (e.g. 'E' crits
           //    for dagger @ AT 20).  So a roll has to both exceed the table's crit threshold and the
           //    crit threshold itself must be nonzero.
           if( (roll > weapon[w]->AT[at].crit[j]) && (weapon[w]->AT[at].crit[j]) )
           {
               // In this version, add in the typical non-crit-casualty hit point damage for the critical
               //    *first*, before evaluating the possibility of crit casualty.
               // As per NOTE 10, the critical damage is now somewhat randomized.  And on a tangent
               //    related to NOTE 9 the added damage for different sizeMod targets make more
               //    sense now (multidimensional critDam array).
               // As per NOTE 11: New crit casualty rates and damage assessments based on special
               //    attackers (using kata, using magic weapons, in Holy place, etc.)
               switch (spCritIdx)
                   {
                   case 1:   // attackers do extra critical, rolled independently
                       thisAttackDamage += (critDam[sizeMod][j] * critDamSpread *
                                           (ran1(&nGenerate) + ran1(&nGenerate))) ;
                       break;
                   case 2:   // attackers using weapons kata (extra crit, same roll, one degree less)
                       if (j >= 4)    // 'A' crit resolves damage normally
                           thisAttackDamage += (critDam[sizeMod][j] * critDamSpread * ran1(&nGenerate));
                       else           // Crits 'E' thru 'B' get extra crit damage, at one degree less, same roll
                           thisAttackDamage += ((critDam[sizeMod][j] + critDam[sizeMod][j+1]) *
                                                 critDamSpread * ran1(&nGenerate));
                       break;
                   case 3:   // attackers have magic weaponry (only a difference for L, SL targets)
                       thisAttackDamage += (magicCritDam[sizeMod][j] * critDamSpread * ran1(&nGenerate));
                       break;
                   case 4:   // attackers fighting on their Holy site (roll all targets on L Holy except SL)
                       thisAttackDamage += (holyCritDam[sizeMod][j] * critDamSpread * ran1(&nGenerate));
                       break;
                   case 5:   // attackers are doing all 'slaying' criticals
                       if ((sizeMod == 4) || (sizeMod == 5))   // Roll once if L or SL
                           thisAttackDamage += (slayCritDam[sizeMod][j] * critDamSpread * ran1(&nGenerate));
                       else    // otherwise roll on usual table and then roll again from 'Slay' table
                           thisAttackDamage += (slayCritDam[sizeMod][j] * critDamSpread * ran1(&nGenerate))
                                             + (critDam[sizeMod][j] * critDamSpread * ran1(&nGenerate)) ;
                       break;
                   default:  // normal attacker
                       thisAttackDamage += (critDam[sizeMod][j] * critDamSpread * ran1(&nGenerate));
                       break;
                   }
               // Assess (via blanket probability relating to the crit severity and hardiness of the
               //    target) whether the target becomes a casualty.
               // NOTE 4 ----- NOW RESOLVED below
               // Make a non-OE dieRoll routine and use it here (straight percent probability).
               // As per NOTE 11, special attack modes that do different criticals are now taken into
               //   account.  This requires a little more computing to figure the proper chance of a
               //   casualty.  Compute the probability in float [0,1] before converting to int percent.
               switch (spCritIdx)
                   {
                   case 1:   // attackers do extra critical, rolled independently, raising casualty chance
                       // First do table lookup for the one-crit casualty chance
                       critCasualtyP_float = (critTable[sizeMod][j] / 100.0) ;
                       // Chance of casualty for two independent crits is 2r - r*r
                       critCasualtyP_float = 2*critCasualtyP_float - critCasualtyP_float*critCasualtyP_float ;
                       break;
                   case 3:   // attackers have magic weaponry (only a difference for L, SL targets)
                       critCasualtyP_float = (magicCritTable[sizeMod][j] / 100.0) ;
                       break;
                   case 4:   // attackers fighting on their Holy grounds
                       critCasualtyP_float = (holyCritTable[sizeMod][j] / 100.0) ;
                       break;
                   case 5:   // attackers are doing 'slay' crits.  One roll for L, SL; otherwise two rolls
                       if ((sizeMod == 4) || (sizeMod == 5))   // Roll once if L or SL
                           critCasualtyP_float = (slayCritTable[sizeMod][j] / 100.0) ;
                       else   // Chance of casualty for two independent crits is  r+s - r*s
                           critCasualtyP_float = ((slayCritTable[sizeMod][j] / 100.0) +
                                                 (critTable[sizeMod][j] / 100.0))    -
                                                 ((slayCritTable[sizeMod][j] / 100.0) *
                                                 (critTable[sizeMod][j] / 100.0)) ;
                       break;
                   default:  // normal attacker ('0') or kata attacker ('2')
                       critCasualtyP_float = (critTable[sizeMod][j] / 100.0) ;
                       break;
                   }  // end switch
               // Round integer percent chance of casualty up, with small nudge down to permit zero results.
               critCasualtyP_percent = (int) (ceil((critCasualtyP_float - 0.0005) * 100.0)) ;
               // dieRoll_flat is 1 to 100, so a zero percent chance result *will* resolve accurately.
               if ( dieRoll_flat() <= critCasualtyP_percent )
               {
                   critCasualty = 1 ;
                   // NOTE 5 ----- ADEQUATELY RESOLVED below
                   // Note that the proper amount to deduct from the aggregate hits is hard to guess
                   //    in advance!  The proper amount is closer to the avg hits-per-member *after* the
                   //    attack than the hits-per-member before the attack.  So how to divine that?
                   //    Rather, use the average hits among the remaining targets to figure out what to
                   //    take away from the aggregate in the event of a crit casualty.  It's reasonable
                   //    and not skewed.  Only deviate from this if casualty was also a 'maxHits' casualty.
               }
               break;  // Critical is found & has been applied, so break out of the critical 'for' loop!
           }   // end of critical application if-else
       }  // end of critical-finding for-loop
       // NEW.... Consider possbility of hits-based casualties.  If single attack damage exceeds starting
       //    hits for any/all defenders, a casualty is guaranteed.
       if (thisAttackDamage >= defUnit[U_HT_S])
           {
           maxHitsCasualty = 1 ;
           thisAttackDamage = defUnit[U_HT_S] ;   // Cap the damage to be deducted from def unit's aggregate
           }
       // Consider probability of a lesser hit taking out a previously-wounded member of the defending
       //    unit.  This assessment of chance is a bit math-intensive, so don't pursue it if we already
       //    have established that the target is a casualty otherwise.  Might want to preclude it also
       //    if, for instance, the damage doesn't even meet the unit's current per-member avg hits.
       if ( ((critCasualty + maxHitsCasualty) == 0) && (thisAttackDamage >= defUnit[U_HT_N]) )
           {
           statisticalRandomTargHits = defineRandomGuyHits(numDefSave,
                                                           ((numDef > 0) ? (numDef) : 0),
                                                           hits,defUnit[U_HT_S]);
           if (thisAttackDamage >= statisticalRandomTargHits)
               highHitsCasualty = 1;
           }
       // NEW.... Fold in results of the single attack.  Consider the possibilities from various casualty
       //    types and make a reasonable judgement on how to adjust aggregate hits.  Don't forget to count
       //    any casualty against numDef.
       if ( (critCasualty + maxHitsCasualty + highHitsCasualty) == 0 )   // Not a casualty
           hits -= thisAttackDamage ;
       else    // There is a casualty of some type.  Have the maxHits type take highest precedence.
           {
           if (maxHitsCasualty)
               hits -= thisAttackDamage ;       // This was capped above at defUnit[U_HT_S]
           else if (critCasualty)
               {
               //hits -= defUnit[U_HT_N] * 0.7 ;  // The guesstimation Eubanks employed.
               // Remember that numDef can get driven to zero and below by the attack loop.  So be
               //    serious when trying to figure out the average hits of guys being struck now.
               guysStanding = ((numDef > 0) ? (numDef) : 0) ;
               if (guysStanding == 0)   avgHitsGuysStanding = 0;   // Avoid div by zero
               else avgHitsGuysStanding = (hits / guysStanding) ;
               hits -= avgHitsGuysStanding ;
               }
           else    // Last casualty case must be 'highHitsCasualty'
               hits -= statisticalRandomTargHits ;
           numDef-- ;          // Remove one defender
           }
   }  // end of for-loop for attacks
   // All the attacks have been made now.  It's time to gather and assess the outcome.

   // For the part of the unit that was targeted, aggregate hits have been beaten down from 'hitSave' to
   //    'hits'.  If 'hits' went below zero, cap the mayhem at zero and wipe out any remaining defenders.
   //    It's not overly likely that numDef was still positive if hits went to zero, but it's not impossible.
   // Similar idea for numDef.  The number of defenders in the portion of the unit that was targeted has
   //    been beaten down from numDefSave to numDef (which might now even be negative).  Logically, don't
   //    allow the attack effects to go beyond driving numDef to zero (min) and have zero numDef mean
   //    zero aggregate hits for that subpart of the unit.
   if ((hits < 0) || (numDef <= 0))
       {
       hits = 0 ;
       numDef = 0 ;
       }

   // Survivors rejoin the portion of the unit that was not subject to attacks (if any).  The survivors
   //    are numDef.  The right-hand expression is the number of unit members that were excluded from
   //    being attacked (may be zero).  Add survivors to RHS, and now numDef is the new defending
   //    unit's population.
   // If all defenders were targeted by attacks (defUnit[U_NM_N] - numDefSave is zero) and numDef was
   //    driven to zero, then the resulting population will also be zero and the unit is wiped out.
   numDef += defUnit[U_NM_N] - numDefSave;
   // LOG: Aggregate damage done by the attacking unit is (hitSave - hits) if the computation is
   //    performed here.
   // LOG: Number of casualties expression is (defUnit[U_NM_N] - numDef) AFTER the line above executes,
   //    because the line above puts the survivors back into the unit so a before-after difference
   //    can be computed.
   // LOG: if !(numDef)  DEFENDING UNIT ELIMINATED
   if (logfile == 1)
       {
       char nameAtt[40];
       char nameDef[40];
       strncpy(nameAtt,unitSet[a]->readAddr(U_NAME),40);  //unitSet[a]->fetchData(nameAtt,U_NAME);
       strncpy(nameDef,unitSet[d]->readAddr(U_NAME),40);
       nameAtt[30] = '\0';  nameDef[30] = '\0';
       casualties = (long) ((long)defUnit[U_NM_N] - (long)numDef) ;
       aggDam = (long) ((long)hitSave - (long)hits) ;
       fprintf(logfileptr,"  u#%03ld %s attacks u#%03ld %s with %3ld attacks, inflicts %3ld casualties on %5ld hits damage",(a+1),nameAtt,(d+1),nameDef,numAtt,casualties,aggDam);
       if (!(numDef))
           fprintf(logfileptr,", ELIMINATING DEFENDING UNIT.\n");
       else
           fprintf(logfileptr,".  Unit has %4ld defenders.\n",numDef);
       }
   // Similar thing here.  Must recompute the average per-member hit points by having the surviving
   //    aggregate hitpoints re-join the unit.  Starting pre-attack hits were the number of members
   //    times the Unit HiTs Number.  We take away the aggregate number of hit points of the
   //    individuals who were subject to attack.  Then we put back the surviving hit points.
   //    Finally, divide by the (nonzero) number of survivors to re-establish the unit average hits.
   // Of course if unit was wiped out, zero the hits and prevent the divide-by-zero.
   // For version 2.3, enhance the new average hits computation to address the following problem:
   //    PROBLEM: If any one among the defenders takes non-casualty damage, when the hits are re-stored
   //    the fractional part will be lost and the average declines by at least one.  This can result
   //    in a heavily downward hits bias against large units that are lightly attacked.
   //    SOLUTION: Use the fractional part between whole numbers to determine probabilistically
   //    whether to round up or round down.  Over the long run this will assure unbiased results.
   if (numDef)
       {  // Note that this 'hits' though reverting to average-per-member, is still a float.
          //    Only when it re-stores into the defUnit[] array will it truncate.
       hits = (((defUnit[U_HT_N]*defUnit[U_NM_N]) - hitSave) + hits) / numDef ;
       hits_whole = (int) hits ;   // Truncates
       hits_frac =  (int) ((hits - (float)hits_whole) * 100.0) ;   // Gets the tenths and hundredths parts
       rounding_roll = dieRoll_flat() ;  // Low fractional part is low probability of rounding up.
       if (rounding_roll <= hits_frac)   // Check if probability falls at or under the fractional part
           hits_whole++ ;                //    to round us up to nearest whole hit.
       hits = ((float)hits_whole) + 0.005 ; // Assure that this figure truncates properly when stored as int
       }
   else
       hits = 0 ;
   // NOTE 1 ----- NOW RESOLVED above
   // One thing I do *not* see above is the case handled in which a portion of the unit was targeted
   // and wiped out (numDef driven to zero).  Well, shouldn't the new numDef be defUnit[U_NM_N] minus
   // the numDefSave ?  And compute the new hits accordingly.  Perhaps this would explain sudden
   // disappearance of units (the buggy behavior) I have noticed during use.
   // NOTE 2 ----- NOW RESOLVED below
   // Might be a good idea to cap the unit's hits at the maximum possible considering the original
   //    per-member hits and current # of survivors?  Sudden loss of some members by low hits and
   //    bad crits can cause the resulting avg hits to exceed the starting per-member unit hits.
   //    Clearly this is artificial.  (It's a less-likely artifact now with the various version
   //    enhancements above, but it's still a good precaution).
   if (hits > defUnit[U_HT_S])   hits = defUnit[U_HT_S];
   unitSet[d]->putInt((int)hits,U_HT_N); // adjust hits (rounding; float 'hits' downcast to int.  Bias fixed in version 2.3)
   unitSet[d]->putInt(numDef,U_NM_N);  // adjust number (bring long back down to int)

   // adjust the rest of the stats
   // exhaustion
   // I don't much cotton to this 'exhaustion' stuff, and do not pay attention to it.  It doesn't
   //    make any sense unless you assume the mass combat battle round to have some fixed duration
   //    (which is not specified in this program's documentation).
   if (defUnit[U_NM_N])   // Only do this if unit still exists (has members)
   {
       ex = defUnit[U_EX_N] - ((10L * numDefSave) / defUnit[U_NM_N]) ;
       if (ex < 0)  ex = 0 ;   // Version 2.3, floor at zero for aesthetic purposes.
	   unitSet[d]->putInt(ex,U_EX_N);
   }
   else
       unitSet[d]->putInt(0,U_EX_N);

	// calculate percentages of unit strength and hits
    // Could alternately use defUnit[U_NM_N] expression, but at this point numDef is still that same number.
    //    numPer, therefore, is float expression for current fraction of full unit strength.
    //    Note that there could be yet another attack coming on this unit, and more casualties may accrue
    //    before the battle turn is through.
	numPer = ((float)numDef)/(float)defUnit[U_NM_S];

	if (defUnit[U_HT_N])
	   hitPer = ((float)hits)/(float)defUnit[U_HT_S];
    else
	   hitPer = 0.;

   // Do morale
   // This first number is based on total casualty ratio and discipline.  It is generally 100 (which is
   //    usually the starting figure prior to battle, defUnit[U_MR_S]) if there are no casualties in
   //    the unit.  A full-strength unit with a non-negative modifier won't have any morale problem.
   //    For every 25% casualties down from full strength, this value is reduced by the discipline minus.
   // In the original code, all units were assumed to have base 100 morale and 100 was explicitly in the
   //    formula below.  In Version 2.1 and above, defUnit[U_MR_S] actually gets used, so a base of
   //    something other than 100 is possible.
   mr = ((float)defUnit[U_MR_S]) + ((1.-numPer) * (float)defUnit[U_DIS] * 4.0) ;
   // This result will get written to Unit MoRale Now.  Note that this figure only reflects starting
   //    morale plus the interaction between accrued casualties and the unit's discipline.
   // NOTE 8 ----- FIXED ABOVE, and QUESTIONS HAVE BEEN ANSWERED SATISFACTORILY
   // Q: Why is it done this way?
   // A: It is consistent with War Law, as described more fully below.
   // Q: Where is the morale carried over from the last round of combat taken into account?
   // A: By War Law, the carry-over is only via the accruing casualties interacting with discipline.
   //    This decreases U_MR_N from its starting point U_MR_S.  As long as the unit's population through
   //    a battle can only decrease, so to will the U_MR_N only decrease.  NOTE that a user making a
   //    modification directly to U_MR_N will have *no effect* on any future morale results, since
   //    U_MR_N will be overwritten with a new derived value prior to the next possible morale fail check.
   //    Any morale mods originating from leaders, table results, situation, etc. should instead be summed
   //    and entered into the modifier box.
   // Q: Will a user-adjusted morale before a mass combat round have any effect?
   // A: Only if the adjustment sums into the 'modifier' box, or is used to make U_MR_S something other
   //    than 100.  The 'Now' box is essentially an output-only box; a user's mod to that box never
   //    enters into calculations.
   // Q: How can the morale result be trusted when this unit might be attacked several more times before
   //    the battle round is over?
   // A: As you can see, morale will be computed behind the scenes every time the unit is attacked.  The
   //    user, however, will only see the morale result that occurred after the final attack on any
   //    particular unit.  Actually, there is no problem with this, because the results one sees are the
   //    same as if only one morale roll were made for each attacked unit.  Any intermediate morale results,
   //    which by definition would have been false, incomplete ones, get overwritten.  We only see the
   //    results that are rolled once all the casualties have accrued.  And this is what you want and expect.
   unitSet[d]->putInt(mr,U_MR_N);
   // Add the modifier to the casualties / discipline base figure.
   mr += defUnit[U_MR_M];
   // NOTE 7 ----- NOW RESOLVED below
   // The original roll code was a little convoluted, but I figured that it was intended to simulate an
   //    OEH roll, which is consistent with War Law.  I replaced the code with an explicit, clear OEH
   //    roll call.
   roll = dieRoll_OEH();
   // Add the modified morale figure from above to the morale roll.  If the total is 100 or better, there
   //    is no morale failure this turn.
   roll += mr;
   // The modified morale figure gets re-used for temporary storage of a morale result character.  A bit
   //    off-putting, but it was in the original code and it works, so....
   if (roll < 50)
       mr = 'E';
   else if (roll < 65)
	   mr = 'D';
   else if (roll < 80)
       mr = 'C';
   else if (roll < 90)
       mr = 'B';
   else if (roll < 100)
       mr = 'A';
   else mr = ' ';
   // Write the morale failure character.
   unitSet[d]->putData((char*)&mr,U_MC);

   // Final catch-all if entire defending unit is now gone.  Note that morale failure becomes moot.
   if (numDef == 0)
        {
        mr = ' ';
        unitSet[d]->putData((char*)&mr,U_MC);
        unitSet[d]->putInt(0,U_MR_N);
        unitSet[d]->putInt(0,U_EX_N);
        unitSet[d]->putInt(0,U_MV_N);
        }

   // End the subroutine here if we are using the /C runtime switch and *not* adjusting OB and DB
   //    for exhaustion.  Have also added 'movement' under this protection.
   if (restrict) return;
   // OB and DB
   i = (1.-hitPer)*40 + (1.- float(ex)/100.)*40; // 10 pts for each 25%
   unitSet[d]->putInt(defUnit[U_OB_S]-i,U_OB_N);
   i = defUnit[U_DB_S]-i; // restrict DB to non-neg values
   if (i<0) i=0;
   unitSet[d]->putInt(i,U_DB_N);

   // movement
   // Note that Eubanks attached this to the 'exhaustion' figure whether the /C option was used or not.
   // My version will protect 'movement' when /C is used.
   // NOTE 6 ----- NOW RESOLVED by cut-and-paste
   // Might want to detach from exhaustion upon /C switch
   if (defUnit[U_MV_N])
      i = ( (defUnit[U_MV_S] + defUnit[U_MV_M]) * ex ) / 100L;
   else
      i = 0;
   if (i<0) i=0;
   unitSet[d]->putInt(i,U_MV_N);

}

char *crToNull(char *str,int n)
{
   int i;

   for(i=0;i<n;i++)
   {
   if (str[i] < 32)
       {
       str[i] = 0;
       return str;
       }
   }
   str[n-1] = 0;
   return str;
}

int num(DataSet *data, int field, int min, int max)
{
   int i;

   i = atoi( data->readAddr(field));
   if ((i>=min)&&(i<=max)) return i;
   return NAN;
}

int compare(const char *str1, const char *str2)
{
   int i=0,j=0,enable=0;
   char c1,c2;

   for(;;)
   {
       while((c1 = toupper(str1[i++])) == ' '); // ignore blanks
       while((c2 = toupper(str2[j++])) == ' ');

       if (c1 == c2) enable=1;

       if ((!c1)&&(!c2)) return enable;
       if (c2 != c1) return 0;
   }
}


// "Minimal" random number generator of Park and Miller with Bays-Durham shuffle and added
// safeguards.  Returns a uniform random deviate between 0.0 and 1.0 (exclusive of the endpoint
// values).  Call with idum a negative integer to initialize; thereafter, do not alter idum between
// successive deviates in a sequence.  RNMX should approximate the largest floating value that is
// less than 1.
float ran1(long *idum)
{
    int j;
    long k;
    static long iy=0;
    static long iv[NTAB];
    float temp;

    if (*idum <= 0 || !iy)
        {                                              // Initialize.
        if (-(*idum) < 1) *idum=1;                     // Be sure to prevent idum = 0.
        else *idum = -(*idum);
        for (j=NTAB+7;j>=0;j--)
            {                                          // Load the shuffle table (after 8 warm-ups).
            k=(*idum)/IQ;
            *idum=IA*(*idum-k*IQ)-IR*k;
            if (*idum < 0) *idum += IM;
            if (j < NTAB) iv[j] = *idum;
            }
        iy=iv[0];
        }
    k=(*idum)/IQ;                                       // Start here when not initializing.
    *idum=IA*(*idum-k*IQ)-IR*k;                         // Compute idum=(IA*idum) % IM without over-
    if (*idum < 0) *idum += IM;                         //   flows by Schrage's method.
    j=iy/NDIV;                                          // Will be in the range 0..NTAB-1.
    iy=iv[j];                                           // Output previously stored value and refill the
    iv[j] = *idum;                                      //   shuffle table.
    if ((temp=AM*iy) > RNMX) return RNMX;               // Because users don't expect endpoint values.
    else return temp;
}


// Returns a normally distributed deviate with zero mean and unit variance, using ran1(idum)
// as the source of uniform deviates.  NOTE that this _zpos version is a variation that only returns
// numbers from the z >= 0 part of the distribution!
float gasdev_zpos(long *idum)
{
    static int iset = 0 ;
    static float gset;
    float fac,rsq,v1,v2;

    if (*idum < 0) iset=0;                                // Reinitialize.
    if (iset == 0)                                        // We don't have an extra deviate handy, so
        {                                                 //    pick two uniform numbers in the square
        do                                                //    extending from -1 to +1 in each direction,
            {                                             //    see if they are in the unit circle,
            v1 =     ran1(idum)       ;                   //    and if they are not, try again.
            v2 =     ran1(idum)       ;  // mod for only +z gaussians !!
            rsq = v1*v1 + v2*v2 ;
            }
        while (rsq >= 1.0 || rsq == 0.0) ;
        fac = sqrt( -2.0*log(rsq) / rsq ) ;
        // Now make the Box-Muller transformation to get two normal deviates. Return one and
        // save the other for next time.
        gset = v1*fac ;
        iset = 1 ;                                        // Set flag.
        return (v2*fac) ;
        }
    else                                                  // We have an extra deviate handy,
        {                                                 //    so unset the flag,
        iset = 0 ;                                        //    and return it.
        return gset;
        }
}


float defineRandomGuyHits(int orig_N, int current_N, float agg_hits, float max_hits)
{
    const float spread = 2.0 ;
    float avg_hits;
    float gaussfloat, gauss_hits;
    float stdev;

    // Handle goofball cases that really shouldn't result in calls to this function.
    if (current_N <= 0)   return max_hits ;     // All legitimate targets are already dead.
    else if (orig_N == 1)   return agg_hits ;   // There's been only one guy all along.  agg_hits = his hits
    // Is there just one guy left?  His hits are the agg_hits unless the aggregate exceeds max possible.
    else if (current_N == 1) return ((agg_hits > max_hits) ? (max_hits) : (agg_hits)) ;

    // There's at least a couple guys left among those being attacked.  Generate a hypothetical distribution
    //    of hit points and somewhat-randomly pluck out an individual.  Still, the agg_hits figure could be
    //    goofy, so screen for that.
    avg_hits = agg_hits / current_N ;
    if ((max_hits <= avg_hits) || (agg_hits <= 0)) return max_hits ; // Avg_hits is providing no useful info
    // Okay, all the goofy cases should be behind us.  The avg_hits is a meaningful positive definite
    //    value less than max_hits.  Now, we (arbitrarily) say here that our "random" guy is going to be
    //    selected between the average and the max, and we'll consider the max to be plus-two sigma
    //    up from the average.  This is ad-hoc stuff, but its a kind of randomness.
    stdev = (max_hits - avg_hits) / spread ;
    // One last goofiness check; if stdev is rather small, don't mess with it.
    if (stdev < 0.5) return max_hits ;
    // Call for a z > 0, zero-mean unity-standard-dev normally distributed value.  nGenerate should
    //    have been seeded with a negative integer at the start of main(), and should not be altered
    //    (other than by ran1 itself) thereafter.
    gaussfloat = gasdev_zpos(&nGenerate);
    gauss_hits = avg_hits + (gaussfloat * stdev);
    if (gaussfloat >= spread)  gauss_hits = max_hits;
    return (gauss_hits) ;
}

// This routine seemed to be intended as a standard open-ended roll generator (OE), but the open-ended low
//    (OEL) part was mis-written by the original author.  In a program in which OE rolls are used instead
//    of OEH-plus-fumble, this has the effect of very-high-OB "units" hitting a little more often than
//    they should.
// I modify this code now to correct dieRoll() and make it a proper OE generator.
int dieRoll_OE()
{
    int r1, r2 ;

    r2 = r1 = rand()%100 + 1;

    if (r1 < 6)
        do
        {
            r1 = rand()%100 + 1;
            r2 -= r1;
        } while (r1 > 95);
    else if (r1 > 95)
        do
        {
            r1 = rand()%100 + 1;
            r2 += r1;
        } while (r1 > 95);
    return r2;
}

// Since the original program had only one dieRoll call and *that* generated pure open-ended rolls,
//    I write this stub with the original function name to refer to the explicitly-renamed routine.
//    Any legacy dieRoll() calls in the code left as-is are thus still open-ended die rolls.
int dieRoll()
{
    return dieRoll_OE();
}

// Open-ended-low die roll.
int dieRoll_OEL()
{
    int r1, r2 ;

    r2 = r1 = rand()%100 + 1;

    if (r1 < 6)
        do
        {
            r1 = rand()%100 + 1;
            r2 -= r1;
        } while (r1 > 95);
    return r2;
}

// Open-ended-high die roll
int dieRoll_OEH()
{
    int r1, r2 ;

    r2 = r1 = rand()%100 + 1;

    if (r1 > 95)
        do
        {
            r1 = rand()%100 + 1;
            r2 += r1;
        } while (r1 > 95);
    return r2;
}

// Flat 1-100 roll, uniform distribution.
int dieRoll_flat()
{
    int r1;

    r1 = rand()%100 + 1;
    return r1;
}


char *weapName(int i)
{
    return weapon[i]->name;
}

int weaponSearch_atkscrn()
{
	point ul,lr;
	lr.row = 21; lr.col = 30; ul.row = 1; ul.col = 1;
	List list( weapName, numWeap, ul, lr);
	return list.get();
}



