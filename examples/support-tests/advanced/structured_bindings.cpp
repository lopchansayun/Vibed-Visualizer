#include <iostream>
#include <utility>
using namespace std;

int main() {
    pair<int, int> point = {4, 9};
    auto [x, y] = point;
    cout << x << " " << y << endl;
}
