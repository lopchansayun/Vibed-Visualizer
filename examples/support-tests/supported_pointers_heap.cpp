#include <iostream>
using namespace std;

int main() {
    int x = 10;
    int* p = &x;
    *p = 25;

    int* a = new int[3];
    a[0] = 7;
    a[1] = 8;
    a[2] = 9;

    cout << *p << " " << a[1] << endl;

    delete[] a;
    return 0;
}
