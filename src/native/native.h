#pragma once
#include <napi.h>
#include "Robot.h"

void InitKeyboard(Napi::Env env, Napi::Object exports);
void InitMouse(Napi::Env env, Napi::Object exports);
void InitClipboard(Napi::Env env, Napi::Object exports);
void InitScreen(Napi::Env env, Napi::Object exports);
void InitWindow(Napi::Env env, Napi::Object exports);
void InitProcess(Napi::Env env, Napi::Object exports);
void InitMemory(Napi::Env env, Napi::Object exports);
