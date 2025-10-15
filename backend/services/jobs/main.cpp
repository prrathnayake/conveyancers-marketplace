#include <chrono>
#include <iostream>
#include <thread>

int main() {
  std::cout << "jobs service running (ws on 9002)\n";
  // Keep the placeholder service alive without burning CPU.
  while (true) {
    std::this_thread::sleep_for(std::chrono::hours(1));
  }
}
