// Stand-in for WINDOW.HPP: the weapon-picker list is not used by the tests.
#pragma once
struct point { int row, col; };
class List {
 public:
  List(char* (*)(int), int, point, point) {}
  int get() { return -1; }
};
