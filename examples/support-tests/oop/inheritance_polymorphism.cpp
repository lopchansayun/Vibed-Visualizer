#include <iostream>
using namespace std;

class Animal {
public:
    virtual void speak() {
        cout << "animal" << endl;
    }
};

class Dog : public Animal {
public:
    void speak() override {
        cout << "dog" << endl;
    }
};

int main() {
    Animal* a = new Dog();
    a->speak();
    delete a;
}
