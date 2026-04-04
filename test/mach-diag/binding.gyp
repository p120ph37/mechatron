{
  "targets": [{
    "target_name": "mach_diag",
    "conditions": [
      ["OS=='mac'", {
        "sources": ["mach_diag.c"],
        "libraries": ["-framework CoreFoundation", "-framework Security"]
      }]
    ]
  }]
}
