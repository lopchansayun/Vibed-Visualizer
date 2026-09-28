#include <iostream>
using namespace std;

int add(int a, int b) { return a + b; }

int apply(int (*fn)(int, int), int a, int b) {
    return fn(a, b);
}

int main() {
    int (*operation)(int, int) = add;
    cout << operation(2, 3) << endl;
    cout << apply(add, 4, 5) << endl;
}
