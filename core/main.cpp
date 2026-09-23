#include "adapter.hpp"
#include "fields.hpp"
#include <iostream>
#include <vector>
#include <limits>

std::array<DataSet,200> snapshots;
bool legacyArmor=false;
int restrict=0, logfile=0;
FILE* logfileptr=nullptr;
long nGenerate=-1;
long lastAttackCount=0, lastDamage=0;
DataSet scratch;
DataSet* tempData=&scratch;
static uint32_t randomState=1;
unsigned portableRandom() { randomState=randomState*214013u+2531011u; return (randomState>>16)&0x7fffu; }
std::string line() { std::string value; if(!std::getline(std::cin,value)) throw std::runtime_error("Incomplete engine input"); if(value.size()>63) throw std::runtime_error("Field too long"); return value; }
int integer(int low,int high) { auto s=line(); size_t used=0; int v=std::stoi(s,&used); if(used!=s.size() || v<low || v>high) throw std::runtime_error("Invalid engine integer"); return v; }
int main() {
    try {
        if(line()!="WARCOM/1") throw std::runtime_error("Unsupported protocol");
        int seed=integer(1,2147483646); randomState=seed; nGenerate=-seed;
        restrict=integer(0,1); legacyArmor=integer(0,1); int round=integer(0,1);
        int count=integer(1,200);
        std::array<DataSet,200> units; std::array<DataSet*,200> pointers;
        for(int i=0;i<200;i++) pointers[i]=&units[i];
        for(int i=0;i<count;i++) for(int j=0;j<27;j++) units[i].putData(line().c_str(),j);
        snapshots=units;
        int assignmentCount=integer(1,200);
        std::vector<DataSet> assignments(assignmentCount);
        for(auto &attack:assignments) for(int j=0;j<8;j++) attack.putData(line().c_str(),j);
        initWeap();
        for(auto &attack:assignments) {
            int a=num(&attack,A_ATT,1,count)-1, d=num(&attack,A_DEF,1,count)-1;
            if(a<0 || d<0) throw std::runtime_error("Invalid unit reference");
            for(int index: {a,d}) {
                auto &u=units[index];
                if(num(&u,U_NM_S,1,9999)<1 || num(&u,U_HT_S,1,9999)<1 || num(&u,U_NM_N,0,9999)<0 || num(&u,U_HT_N,0,9999)<0) throw std::runtime_error("Invalid strength or hits");
            }
            if(getWeap(&attack,pointers.data())<0) throw std::runtime_error("Invalid weapon");
        }
        std::cout<<"WARCOM/1\n"<<assignmentCount<<'\n';
        for(auto &attack:assignments) {
            int d=std::atoi(attack.readAddr(A_DEF))-1;
            int before=std::atoi(units[d].readAddr(U_NM_N));
            int hits=std::atoi(units[d].readAddr(U_HT_N));
            lastAttackCount=0; lastDamage=0;
            resolve(&attack,pointers.data(),round);
            std::cout<<d<<'\n'<<before<<'\n'<<units[d].readAddr(U_NM_N)<<'\n'<<hits<<'\n'<<units[d].readAddr(U_HT_N)<<'\n'<<lastAttackCount<<'\n'<<lastDamage<<'\n';
        }
        std::cout<<count<<'\n';
        for(int i=0;i<count;i++) for(int j=0;j<27;j++) std::cout<<units[i].readAddr(j)<<'\n';
        return 0;
    } catch(const std::exception &e) { std::cerr<<e.what()<<'\n'; return 1; }
}
