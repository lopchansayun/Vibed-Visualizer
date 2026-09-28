#include <iostream>
using namespace std;

class Student {
public:
    int age;

    Student(int a) {
        age = a;
    }

    void birthday() {
        age++;
    }

    void show() {
        cout << age << endl;
    }
};

int main() {
    Student s(20);
    s.birthday();
    s.show();
}
