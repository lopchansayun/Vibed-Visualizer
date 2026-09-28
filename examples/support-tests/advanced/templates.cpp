#include <iostream>
using namespace std;

template <typename T>
T bigger(T a, T b) {
    if (a > b) return a;
    return b;
}

int main() {
    cout << bigger<int>(3, 7) << endl;
}
