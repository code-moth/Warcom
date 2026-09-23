#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>

// The resolver's field interface, independent of DOS screen layout and ownership.
class DataSet {
    std::array<std::array<char,64>,27> values{};
public:
    char* readAddr(int field) { return values.at(field).data(); }
    int getSize() const { return sizeof(values); }
    const char* putData(const char* value,int field) {
        auto &slot=values.at(field); slot.fill(0);
        std::strncpy(slot.data(),value,slot.size()-1); return value;
    }
    int putInt(int value,int field) { putData(std::to_string(value).c_str(),field); return value; }
};
extern std::array<DataSet,200> snapshots;
extern bool legacyArmor;
extern long lastAttackCount, lastDamage;
unsigned portableRandom();
void initWeap();
void resolve(DataSet*,DataSet**,int);
int getWeap(DataSet*,DataSet**);
int num(DataSet*,int,int,int);
int compare(const char*,const char*);
char* crToNull(char*,int);
char* weapName(int);
int dieRoll();
int dieRoll_OE();
int dieRoll_OEH();
int dieRoll_OEL();
int dieRoll_flat();
inline void error(const char* value) { throw std::runtime_error(value); }
inline int message(const char* value,int) { if (*value) throw std::runtime_error(value); return 0; }
