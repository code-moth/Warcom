// Minimal stand-in for the DOS text-mode data layer (DATASCRN.HPP), just enough for RESOLVE.CPP.
#pragma once
#include <cstdio>
#include <cstring>
#include <cstdlib>

class DataScreen {
 public:
  int kind;  // 0 = unit screen, 1 = attack screen
  explicit DataScreen(int k = 0) : kind(k) {}
};

class DataSet;
extern DataSet* g_backup;  // stands in for BACKUP.UNT

class DataSet {
 public:
  // Field widths from SCRN1.TXT / SCRN2.TXT (the +1 is the terminating NUL).
  static int width(int kind, int e) {
    static const int U[27] = {30, 30, 30, 28, 2, 3, 1, 25, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4};
    static const int A[8] = {3, 4, 3, 4, 4, 1, 1, 30};
    return (kind == 0 ? U[e] : A[e]) + 1;
  }
  int kind;
  char f[27][96];
  explicit DataSet(DataScreen* s) : kind(s->kind) { memset(f, 0, sizeof f); }
  char* readAddr(int e) { return f[e]; }
  const char* putData(const char* src, int e) { strncpy(f[e], src, width(kind, e)); return src; }
  int putInt(int n, int e) { char b[16]; snprintf(b, sizeof b, "%d", n); strncpy(f[e], b, width(kind, e)); return n; }
  int getSize() { return sizeof f; }
  void clear() { memset(f, 0, sizeof f); }
  int restoreData(FILE*, int record) { memcpy(f, g_backup[record].f, sizeof f); return 1; }
};

void error(char* message);
int warcom_rand();  // Borland C rand(), defined by the harness
