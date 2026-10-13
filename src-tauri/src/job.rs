//! Windows Job Objects (roadmap 2.4).
//!
//! A job is a group of processes the system tracks together. With `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` every process in
//! it ends when the last handle to the job closes, and `TerminateJobObject` ends them on demand. Compared with
//! `taskkill /T`, this reaches grandchildren that changed their parent, needs no helper process, and cannot flash a
//! console window.
//!
//! A command Cero runs gets its own job. When it ends normally the job is `release`d first: programs the command
//! started on purpose (an editor, a dev server) must outlive it. Only a cancel, a timeout, or Cero itself dying
//! ends the tree.
//!
//! A child that spawns another program in the first microseconds after `CreateProcess`, before the job assignment,
//! escapes the job. Shells take far longer than that to start anything.

use std::io;
use std::mem;
use std::os::windows::io::RawHandle;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
    TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

pub struct Job {
    handle: HANDLE,
}

// A job handle may be used from any thread
unsafe impl Send for Job {}
unsafe impl Sync for Job {}

impl Job {
    /// A new job whose processes all end when it is closed.
    pub fn new() -> io::Result<Job> {
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let job = Job { handle };
        job.set_limit_flags(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)?;
        Ok(job)
    }

    fn set_limit_flags(&self, flags: u32) -> io::Result<()> {
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { mem::zeroed() };
        info.BasicLimitInformation.LimitFlags = flags;
        let ok = unsafe {
            SetInformationJobObject(
                self.handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if ok == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    /// Put a running process (and from now on everything it starts) into the job.
    pub fn assign(&self, process: RawHandle) -> io::Result<()> {
        if unsafe { AssignProcessToJobObject(self.handle, process as HANDLE) } == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    /// End every process in the job now.
    pub fn terminate(&self) -> io::Result<()> {
        if unsafe { TerminateJobObject(self.handle, 1) } == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    /// Let the processes in the job live on when the job is closed.
    pub fn release(&self) {
        let _ = self.set_limit_flags(0);
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.handle);
        }
    }
}

/// Ends the processes of the `llama-server` and anything else Cero starts for itself when Cero dies, even when it
/// is killed and cannot clean up.
pub fn app_job() -> Option<&'static Job> {
    use std::sync::OnceLock;
    static APP_JOB: OnceLock<Option<Job>> = OnceLock::new();
    APP_JOB.get_or_init(|| Job::new().ok()).as_ref()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    fn sleeper() -> std::process::Child {
        Command::new("ping")
            .args(["-n", "60", "127.0.0.1"])
            .creation_flags(0x0800_0000)
            .stdout(Stdio::null())
            .spawn()
            .expect("ping starts")
    }

    fn ends_within(child: &mut std::process::Child, secs: u64) -> bool {
        let deadline = Instant::now() + Duration::from_secs(secs);
        while Instant::now() < deadline {
            if child.try_wait().unwrap().is_some() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    #[test]
    fn terminate_ends_the_process() {
        let job = Job::new().unwrap();
        let mut child = sleeper();
        job.assign(child.as_raw_handle()).unwrap();
        job.terminate().unwrap();
        assert!(ends_within(&mut child, 5));
    }

    #[test]
    fn closing_the_job_ends_the_process() {
        let mut child = sleeper();
        {
            let job = Job::new().unwrap();
            job.assign(child.as_raw_handle()).unwrap();
        }
        assert!(ends_within(&mut child, 5));
    }

    #[test]
    fn a_released_job_leaves_the_process_running() {
        let mut child = sleeper();
        {
            let job = Job::new().unwrap();
            job.assign(child.as_raw_handle()).unwrap();
            job.release();
        }
        assert!(!ends_within(&mut child, 1), "a released job must not end the process");
        let _ = child.kill();
        let _ = child.wait();
    }

    #[test]
    fn grandchildren_end_with_the_job() {
        // cmd starts ping through `start /b`; ping is a grandchild of this test
        let job = Job::new().unwrap();
        let mut child = Command::new("cmd")
            .args(["/c", "ping -n 60 127.0.0.1 > nul & ping -n 60 127.0.0.1 > nul"])
            .creation_flags(0x0800_0000)
            .spawn()
            .unwrap();
        job.assign(child.as_raw_handle()).unwrap();
        std::thread::sleep(Duration::from_millis(800));
        job.terminate().unwrap();
        assert!(ends_within(&mut child, 5));
    }
}
