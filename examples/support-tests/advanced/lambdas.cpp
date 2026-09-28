#include <iostream>
using namespace std;

int main() {
    int base = 10;
    auto add = [base](int value) { return base + value; };
    cout << add(5) << endl;
}
