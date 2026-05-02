#[cfg(windows)]
mod keyboard_hook {
    use std::{
        sync::{
            mpsc::{channel, Sender},
            Mutex, OnceLock,
        },
        thread,
    };

    use tauri::{AppHandle, Emitter};
    use windows::Win32::{
        Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM},
        UI::WindowsAndMessaging::{
            CallNextHookEx, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK,
            KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
        },
    };

    static KEY_SENDER: OnceLock<Mutex<Option<Sender<String>>>> = OnceLock::new();

    pub fn start(app_handle: AppHandle) {
        let (sender, receiver) = channel::<String>();
        let sender_slot = KEY_SENDER.get_or_init(|| Mutex::new(None));

        if let Ok(mut guard) = sender_slot.lock() {
            *guard = Some(sender);
        }

        thread::spawn(run_message_loop);

        thread::spawn(move || {
            for key in receiver {
                let _ = app_handle.emit("global-key-pressed", key);
            }
        });
    }

    fn run_message_loop() {
        let hook = unsafe {
            SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(keyboard_proc),
                HINSTANCE::default(),
                0,
            )
        };

        let Ok(hook) = hook else {
            return;
        };

        let mut message = MSG::default();

        while unsafe { GetMessageW(&mut message, None, 0, 0) }.as_bool() {}

        unsafe {
            let _ = UnhookWindowsHookEx(hook);
        }
    }

    unsafe extern "system" fn keyboard_proc(code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
        if code >= 0 && w_param.0 as u32 == WM_KEYDOWN {
            let key_info = *(l_param.0 as *const KBDLLHOOKSTRUCT);

            if let Some(key_name) = virtual_key_to_name(key_info.vkCode) {
                if let Some(sender_slot) = KEY_SENDER.get() {
                    if let Ok(guard) = sender_slot.lock() {
                        if let Some(sender) = guard.as_ref() {
                            let _ = sender.send(key_name);
                        }
                    }
                }
            }
        }

        CallNextHookEx(HHOOK::default(), code, w_param, l_param)
    }

    fn virtual_key_to_name(vk_code: u32) -> Option<String> {
        match vk_code {
            0x30..=0x39 => Some(format!("D{}", vk_code - 0x30)),
            0x70..=0x7B => Some(format!("F{}", vk_code - 0x6F)),
            _ => None,
        }
    }
}

pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(windows)]
    let builder = builder.setup(|app| {
        keyboard_hook::start(app.handle().clone());
        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
