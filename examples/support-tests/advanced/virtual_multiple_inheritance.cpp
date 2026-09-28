#include <iostream>
using namespace std;

class Root {
public:
    int root = 1;
};

class Left : virtual public Root {
public:
    int left = 2;
};

class Right : virtual public Root {
public:
    int right = 3;
};

class Diamond : public Left, public Right {
public:
    int value = 4;
};

int main() {
    Diamond d;
    cout << d.root << d.left << d.right << d.value << endl;
}
