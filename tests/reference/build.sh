#!/bin/sh
# Builds the reference oracle from the ORIGINAL legacy/RESOLVE.CPP.
# Only two mechanical patches are applied to a copy:
#   1. rand()        -> warcom_rand()       (Borland C's generator, so results are portable)
#   2. log(rsq)      -> log((double)rsq)    (Turbo C's math.h had no float overload)
set -e
cd "$(dirname "$0")"
mkdir -p out
sed -e 's/\brand()/warcom_rand()/g' -e 's/log(rsq)/log((double)rsq)/' ../../legacy/RESOLVE.CPP > out/resolve_patched.cpp
cp ../../legacy/TEST.HPP out/test.hpp
cp ../../legacy/WEAPONS.DAT out/weapons.dat
g++ -std=gnu++14 -O1 -ffp-contract=off -w -I shim -I out -o out/reference out/resolve_patched.cpp harness.cpp
echo "built out/reference"
