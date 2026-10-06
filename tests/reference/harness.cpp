// Reference oracle for the TypeScript engine: runs the ORIGINAL resolve() from
// legacy/RESOLVE.CPP on a scenario read from stdin and prints the resulting units.
//
// Input (one item per line, fields separated by '|', empty fields allowed):
//   CFG <diceSeed> <ran1Seed> <constantModifiers 0/1> <mode 0=F9 single, 1=F10 all>
//   UNITS <n>      then n lines of 27 fields  (STAT order U_NAME..U_HT_N)
//   ATTACKS <m>    then m lines of 8 fields   (A_ATT..A_WEAPON)
// Output: one line per unit with its 27 fields.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include "datascrn.hpp"
#include "test.hpp"

DataSet* tempData;
DataSet* g_backup;
int restrict = 0;
int logfile = 0;
FILE* logfileptr = NULL;
signed long nGenerate = -1;

void error(char* message) { fprintf(stderr, "error: %s\n", message); exit(2); }
int message(char*, int) { return 0; }
const char* putStr(const char* s, int, int, int, char) { return s; }

// Borland C rand(), as used by the DOS build.
static unsigned int g_seed = 1;
int warcom_rand() { g_seed = g_seed * 0x015A4E35u + 1u; return (int)((g_seed >> 16) & 0x7fff); }

static std::vector<std::string> split(const std::string& s) {
  std::vector<std::string> out; std::string cur;
  for (char c : s) { if (c == '|') { out.push_back(cur); cur.clear(); } else cur += c; }
  out.push_back(cur); return out;
}

int main() {
  std::string line;
  long diceSeed = 1, ranSeed = -1; int mode = 0;
  std::getline(std::cin, line);
  { std::istringstream is(line); std::string tag; is >> tag >> diceSeed >> ranSeed >> restrict >> mode; }
  g_seed = (unsigned int)diceSeed; nGenerate = ranSeed;

  DataScreen unitScreen(0), attackScreen(1);
  const int N = MAX_NUMBER_OF_UNITS;
  std::vector<DataSet*> units(N), attacks(N);
  for (int i = 0; i < N; i++) { units[i] = new DataSet(&unitScreen); attacks[i] = new DataSet(&attackScreen); }
  tempData = new DataSet(&unitScreen);

  int nu = 0, na = 0;
  std::getline(std::cin, line); { std::istringstream is(line); std::string t; is >> t >> nu; }
  for (int i = 0; i < nu; i++) {
    std::getline(std::cin, line); auto f = split(line);
    for (int e = 0; e < 27 && e < (int)f.size(); e++) strncpy(units[i]->f[e], f[e].c_str(), 95);
  }
  std::getline(std::cin, line); { std::istringstream is(line); std::string t; is >> t >> na; }
  for (int i = 0; i < na; i++) {
    std::getline(std::cin, line); auto f = split(line);
    for (int e = 0; e < 8 && e < (int)f.size(); e++) strncpy(attacks[i]->f[e], f[e].c_str(), 95);
  }

  initWeap();

  if (mode == 0) {
    for (int i = 0; i < na; i++) {
      if (getWeap(attacks[i], units.data()) == NO_WEAPON) continue;
      resolve(attacks[i], units.data(), 0);
    }
  } else {
    for (int i = 0; i < N; i++) if (getWeap(attacks[i], units.data()) == NO_WEAPON) { printf("ABORT %d\n", i); return 0; }
    // snapshot the units (BACKUP.UNT)
    DataSet* snap = (DataSet*)operator new(sizeof(DataSet) * N);
    for (int i = 0; i < N; i++) { new (&snap[i]) DataSet(&unitScreen); memcpy(snap[i].f, units[i]->f, sizeof snap[i].f); }
    g_backup = snap;
    FILE* fp = fopen("backup.unt", "wb"); if (fp) fclose(fp);
    for (int i = 0; i < N; i++) resolve(attacks[i], units.data(), 1);
  }

  for (int i = 0; i < nu; i++) {
    printf("U");
    for (int e = 0; e < 27; e++) printf("|%s", units[i]->f[e]);
    printf("\n");
  }
  return 0;
}
