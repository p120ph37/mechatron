/*
 * Minimal NAPI module that exercises macOS Mach VM APIs directly.
 * Build:  cd test/mach-diag && npx node-gyp rebuild
 * Usage:  node test/mach-diag/run.js
 *
 * This is a diagnostic tool for comparing C-based mach VM calls with the
 * Rust native module's behavior. It dumps codesign info, call results,
 * and error codes.
 */

#ifdef __APPLE__

#include <node_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <dlfcn.h>

#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <mach/task.h>
#include <mach/vm_region.h>

/* ---------- helper: throw on bad napi status ---------- */
#define NAPI_CALL(env, call)                                      \
  do {                                                            \
    napi_status _s = (call);                                      \
    if (_s != napi_ok) {                                          \
      napi_throw_error(env, NULL, #call " failed");               \
      return NULL;                                                \
    }                                                             \
  } while (0)

/* ---------- diagnose(pid) ----------
 * Returns a JS object with detailed diagnostics:
 *   pid, uid, arch, selfTask, selfTaskHex,
 *   taskForPid: { kern_return, kern_return_hex, task, taskHex },
 *   machTaskSelf_var, machTaskSelf_fn,
 *   regions: [ { base, size, prot, maxProt } ... ] (first 5),
 *   readTest: { address, size, bytesRead, firstBytes },
 *   codesign: { pid_flags, self_flags }
 */
static napi_value js_diagnose(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));

  int pid = 0;
  if (argc >= 1) {
    NAPI_CALL(env, napi_get_value_int32(env, argv[0], &pid));
  }
  if (pid == 0) pid = getpid();

  napi_value result;
  NAPI_CALL(env, napi_create_object(env, &result));

  /* Basic info */
  napi_value val;

  NAPI_CALL(env, napi_create_int32(env, pid, &val));
  NAPI_CALL(env, napi_set_named_property(env, result, "pid", val));

  NAPI_CALL(env, napi_create_int32(env, getuid(), &val));
  NAPI_CALL(env, napi_set_named_property(env, result, "uid", val));

  NAPI_CALL(env, napi_create_int32(env, geteuid(), &val));
  NAPI_CALL(env, napi_set_named_property(env, result, "euid", val));

#ifdef __arm64__
  NAPI_CALL(env, napi_create_string_utf8(env, "arm64", NAPI_AUTO_LENGTH, &val));
#elif defined(__x86_64__)
  NAPI_CALL(env, napi_create_string_utf8(env, "x86_64", NAPI_AUTO_LENGTH, &val));
#else
  NAPI_CALL(env, napi_create_string_utf8(env, "unknown", NAPI_AUTO_LENGTH, &val));
#endif
  NAPI_CALL(env, napi_set_named_property(env, result, "nativeArch", val));

  /* mach_task_self() — both the macro/variable and the function */
  mach_port_t self_task = mach_task_self();
  NAPI_CALL(env, napi_create_uint32(env, (uint32_t)self_task, &val));
  NAPI_CALL(env, napi_set_named_property(env, result, "machTaskSelf", val));

  /* Also read the global variable directly */
  NAPI_CALL(env, napi_create_uint32(env, (uint32_t)mach_task_self_, &val));
  NAPI_CALL(env, napi_set_named_property(env, result, "machTaskSelf_var", val));

  /* task_for_pid */
  napi_value tfp_obj;
  NAPI_CALL(env, napi_create_object(env, &tfp_obj));

  mach_port_t task = MACH_PORT_NULL;
  kern_return_t kr = task_for_pid(mach_task_self(), pid, &task);

  NAPI_CALL(env, napi_create_int32(env, (int32_t)kr, &val));
  NAPI_CALL(env, napi_set_named_property(env, tfp_obj, "kern_return", val));

  /* Human-readable kern_return name */
  const char *kr_name = "unknown";
  switch (kr) {
    case KERN_SUCCESS:            kr_name = "KERN_SUCCESS"; break;
    case KERN_INVALID_ARGUMENT:   kr_name = "KERN_INVALID_ARGUMENT"; break;
    case KERN_FAILURE:            kr_name = "KERN_FAILURE"; break;
    case KERN_NOT_SUPPORTED:      kr_name = "KERN_NOT_SUPPORTED"; break;
    case KERN_INVALID_ADDRESS:    kr_name = "KERN_INVALID_ADDRESS"; break;
    case KERN_PROTECTION_FAILURE: kr_name = "KERN_PROTECTION_FAILURE"; break;
    case KERN_NO_SPACE:           kr_name = "KERN_NO_SPACE"; break;
    case KERN_INVALID_CAPABILITY: kr_name = "KERN_INVALID_CAPABILITY"; break;
    case KERN_ABORTED:            kr_name = "KERN_ABORTED"; break;
    case 5:                       kr_name = "KERN_INVALID_NAME (5)"; break;
    default: break;
  }
  NAPI_CALL(env, napi_create_string_utf8(env, kr_name, NAPI_AUTO_LENGTH, &val));
  NAPI_CALL(env, napi_set_named_property(env, tfp_obj, "kern_return_name", val));

  NAPI_CALL(env, napi_create_uint32(env, (uint32_t)task, &val));
  NAPI_CALL(env, napi_set_named_property(env, tfp_obj, "task", val));

  NAPI_CALL(env, napi_set_named_property(env, result, "taskForPid", tfp_obj));

  /* If task_for_pid succeeded, try mach_vm_region and mach_vm_read */
  mach_port_t effective_task = (kr == KERN_SUCCESS && task != MACH_PORT_NULL) ? task : mach_task_self();

  /* Also try with mach_task_self() directly (no task_for_pid) */
  napi_value self_task_obj;
  NAPI_CALL(env, napi_create_object(env, &self_task_obj));

  {
    /* mach_vm_region with mach_task_self() */
    mach_vm_address_t addr = 0x1000;
    mach_vm_size_t size = 0;
    vm_region_basic_info_data_64_t info;
    mach_msg_type_number_t count = VM_REGION_BASIC_INFO_COUNT_64;
    mach_port_t object_name = MACH_PORT_NULL;

    kern_return_t rr = mach_vm_region(mach_task_self(), &addr, &size,
      VM_REGION_BASIC_INFO_64, (vm_region_info_t)&info, &count, &object_name);

    NAPI_CALL(env, napi_create_int32(env, (int32_t)rr, &val));
    NAPI_CALL(env, napi_set_named_property(env, self_task_obj, "region_kr", val));

    const char *rr_name = "unknown";
    switch (rr) {
      case KERN_SUCCESS: rr_name = "KERN_SUCCESS"; break;
      case KERN_INVALID_ARGUMENT: rr_name = "KERN_INVALID_ARGUMENT"; break;
      case KERN_FAILURE: rr_name = "KERN_FAILURE"; break;
      case KERN_INVALID_ADDRESS: rr_name = "KERN_INVALID_ADDRESS"; break;
      default: break;
    }
    NAPI_CALL(env, napi_create_string_utf8(env, rr_name, NAPI_AUTO_LENGTH, &val));
    NAPI_CALL(env, napi_set_named_property(env, self_task_obj, "region_kr_name", val));

    if (rr == KERN_SUCCESS) {
      char buf[64];
      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)addr);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, self_task_obj, "region_base", val));

      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)size);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, self_task_obj, "region_size", val));

      NAPI_CALL(env, napi_create_int32(env, info.protection, &val));
      NAPI_CALL(env, napi_set_named_property(env, self_task_obj, "region_prot", val));

      /* Try mach_vm_read_overwrite */
      if (info.protection & VM_PROT_READ) {
        uint8_t read_buf[16];
        mach_vm_size_t bytes_read = 0;
        kern_return_t read_kr = mach_vm_read_overwrite(mach_task_self(),
          addr, sizeof(read_buf), (mach_vm_address_t)read_buf, &bytes_read);

        NAPI_CALL(env, napi_create_int32(env, (int32_t)read_kr, &val));
        NAPI_CALL(env, napi_set_named_property(env, self_task_obj, "read_kr", val));

        NAPI_CALL(env, napi_create_int64(env, (int64_t)bytes_read, &val));
        NAPI_CALL(env, napi_set_named_property(env, self_task_obj, "read_bytes", val));
      }
    }
  }
  NAPI_CALL(env, napi_set_named_property(env, result, "selfTask", self_task_obj));

  /* Same thing but with the task_for_pid result (or mach_task_self if it failed) */
  napi_value tfp_task_obj;
  NAPI_CALL(env, napi_create_object(env, &tfp_task_obj));

  {
    mach_vm_address_t addr = 0x1000;
    mach_vm_size_t size = 0;
    vm_region_basic_info_data_64_t info;
    mach_msg_type_number_t count = VM_REGION_BASIC_INFO_COUNT_64;
    mach_port_t object_name = MACH_PORT_NULL;

    kern_return_t rr = mach_vm_region(effective_task, &addr, &size,
      VM_REGION_BASIC_INFO_64, (vm_region_info_t)&info, &count, &object_name);

    NAPI_CALL(env, napi_create_int32(env, (int32_t)rr, &val));
    NAPI_CALL(env, napi_set_named_property(env, tfp_task_obj, "region_kr", val));

    if (rr == KERN_SUCCESS) {
      char buf[64];
      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)addr);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, tfp_task_obj, "region_base", val));

      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)size);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, tfp_task_obj, "region_size", val));

      NAPI_CALL(env, napi_create_int32(env, info.protection, &val));
      NAPI_CALL(env, napi_set_named_property(env, tfp_task_obj, "region_prot", val));

      if (info.protection & VM_PROT_READ) {
        uint8_t read_buf[16];
        mach_vm_size_t bytes_read = 0;
        kern_return_t read_kr = mach_vm_read_overwrite(effective_task,
          addr, sizeof(read_buf), (mach_vm_address_t)read_buf, &bytes_read);

        NAPI_CALL(env, napi_create_int32(env, (int32_t)read_kr, &val));
        NAPI_CALL(env, napi_set_named_property(env, tfp_task_obj, "read_kr", val));

        NAPI_CALL(env, napi_create_int64(env, (int64_t)bytes_read, &val));
        NAPI_CALL(env, napi_set_named_property(env, tfp_task_obj, "read_bytes", val));
      }
    }
  }
  NAPI_CALL(env, napi_set_named_property(env, result, "tfpTask", tfp_task_obj));

  /* Enumerate first 5 regions using mach_task_self() */
  {
    napi_value regions_arr;
    NAPI_CALL(env, napi_create_array(env, &regions_arr));

    mach_vm_address_t addr = 0;
    int region_count = 0;

    while (region_count < 5) {
      mach_vm_size_t size = 0;
      vm_region_basic_info_data_64_t info;
      mach_msg_type_number_t count = VM_REGION_BASIC_INFO_COUNT_64;
      mach_port_t object_name = MACH_PORT_NULL;

      kern_return_t rr = mach_vm_region(mach_task_self(), &addr, &size,
        VM_REGION_BASIC_INFO_64, (vm_region_info_t)&info, &count, &object_name);

      if (rr != KERN_SUCCESS) break;

      napi_value robj;
      NAPI_CALL(env, napi_create_object(env, &robj));

      char buf[64];
      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)addr);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, robj, "base", val));

      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)size);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, robj, "size", val));

      NAPI_CALL(env, napi_create_int32(env, info.protection, &val));
      NAPI_CALL(env, napi_set_named_property(env, robj, "prot", val));

      NAPI_CALL(env, napi_create_int32(env, info.max_protection, &val));
      NAPI_CALL(env, napi_set_named_property(env, robj, "maxProt", val));

      char prot_str[8];
      snprintf(prot_str, sizeof(prot_str), "%s%s%s",
        (info.protection & VM_PROT_READ)    ? "r" : "-",
        (info.protection & VM_PROT_WRITE)   ? "w" : "-",
        (info.protection & VM_PROT_EXECUTE) ? "x" : "-");
      NAPI_CALL(env, napi_create_string_utf8(env, prot_str, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, robj, "protStr", val));

      NAPI_CALL(env, napi_set_element(env, regions_arr, region_count, robj));
      region_count++;
      addr += size;
    }

    NAPI_CALL(env, napi_set_named_property(env, result, "regions", regions_arr));
  }

  /* dyld info via task_info */
  {
    napi_value dyld_obj;
    NAPI_CALL(env, napi_create_object(env, &dyld_obj));

    struct task_dyld_info dyld_info;
    mach_msg_type_number_t dyld_count = TASK_DYLD_INFO_COUNT;

    kern_return_t dkr = task_info(mach_task_self(), TASK_DYLD_INFO,
      (task_info_t)&dyld_info, &dyld_count);

    NAPI_CALL(env, napi_create_int32(env, (int32_t)dkr, &val));
    NAPI_CALL(env, napi_set_named_property(env, dyld_obj, "kern_return", val));

    if (dkr == KERN_SUCCESS) {
      char buf[64];
      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)dyld_info.all_image_info_addr);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, dyld_obj, "allImageInfoAddr", val));

      snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)dyld_info.all_image_info_size);
      NAPI_CALL(env, napi_create_string_utf8(env, buf, NAPI_AUTO_LENGTH, &val));
      NAPI_CALL(env, napi_set_named_property(env, dyld_obj, "allImageInfoSize", val));

      NAPI_CALL(env, napi_create_int32(env, dyld_info.all_image_info_format, &val));
      NAPI_CALL(env, napi_set_named_property(env, dyld_obj, "format", val));
    }

    NAPI_CALL(env, napi_set_named_property(env, result, "dyldInfo", dyld_obj));
  }

  return result;
}

/* ---------- diagnose_rust_module(path) ----------
 * Load the Rust .node file at the given path using dlopen and report
 * its codesign-related attributes.
 */
static napi_value js_diagnose_binary(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, argv, NULL, NULL));

  char path[1024];
  size_t len = 0;
  NAPI_CALL(env, napi_get_value_string_utf8(env, argv[0], path, sizeof(path), &len));

  napi_value result;
  NAPI_CALL(env, napi_create_object(env, &result));

  napi_value val;
  NAPI_CALL(env, napi_create_string_utf8(env, path, len, &val));
  NAPI_CALL(env, napi_set_named_property(env, result, "path", val));

  /* Try dlopen */
  void *handle = dlopen(path, RTLD_LAZY | RTLD_LOCAL);
  NAPI_CALL(env, napi_get_boolean(env, handle != NULL, &val));
  NAPI_CALL(env, napi_set_named_property(env, result, "dlopen_ok", val));

  if (!handle) {
    const char *err = dlerror();
    NAPI_CALL(env, napi_create_string_utf8(env, err ? err : "(null)", NAPI_AUTO_LENGTH, &val));
    NAPI_CALL(env, napi_set_named_property(env, result, "dlopen_error", val));
  } else {
    dlclose(handle);
  }

  return result;
}

/* ---------- module init ---------- */
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn;

  NAPI_CALL(env, napi_create_function(env, "diagnose", 0, js_diagnose, NULL, &fn));
  NAPI_CALL(env, napi_set_named_property(env, exports, "diagnose", fn));

  NAPI_CALL(env, napi_create_function(env, "diagnoseBinary", 0, js_diagnose_binary, NULL, &fn));
  NAPI_CALL(env, napi_set_named_property(env, exports, "diagnoseBinary", fn));

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

#else
/* Non-macOS stub */
#include <node_api.h>
static napi_value init(napi_env env, napi_value exports) { return exports; }
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
#endif
