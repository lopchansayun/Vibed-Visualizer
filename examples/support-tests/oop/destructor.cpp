#include <iostream>
using namespace std;

class Box {
public:
    int value;

    Box(int v) { value = v; }
    ~Box() { cout << value << endl; }
};

int main() {
    Box* b = new Box(42);
    delete b;
}
