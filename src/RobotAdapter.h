#include <napi.h>

#define ADDON_VERSION 0x000000
#define ADDON_VERSION_STR "0.0.0"

class RobotAdapter :
  public Napi::Addon<RobotAdapter> {

  public:
    RobotAdapter(Napi::Env env, Napi::Object exports);

};
