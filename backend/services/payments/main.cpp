#include <chrono>
#include <iostream>
#include <thread>

int main() {
  std::cout << "payments service running (sandbox)\n";
  // Keep the placeholder process alive without pegging a CPU core.
  while (true) {
    std::this_thread::sleep_for(std::chrono::hours(1));
  }
}
