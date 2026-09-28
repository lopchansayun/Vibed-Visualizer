#include <iostream>
using namespace std;

int main() {
    int a = 10;
    int b = 20;
    int sum = a + b;

    if (sum > 20) {
        sum += 5;
    } else {
        sum -= 5;
    }

    for (int i = 0; i < 3; i++) {
        sum += i;
    }

    cout << "sum = " << sum << endl;
    return 0;
}
