// worker.js
importScripts('yrec.js');

let yrecModule;
let yrecReturn = -1;

(async () => {
  const config = {
    preRun: [],
    onRuntimeInitialized() {
      console.info("YREC initialized.");
      self.postMessage("ready|");
    },
  };

  yrecModule = await YREC(config);
})();

function trimComments(text) {
  return text
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n")
    .map(line => {
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuote = !inQuote;
        if (!inQuote && ch === "!") {
          return line.slice(0, i).replace(/\s+$/, "");
        }
      }
      return line;
    })
    .join("\n") + "\n";
}

self.addEventListener('message', async (e) => {
    if (!yrecModule) {
        console.warn("Module not ready yet");
        return;
    }

    const msg = e.data;

    if (msg === 'run') {
        while (yrecModule.YREC_return_val === -1) {
			try {
				yrecModule.YREC_return_val = yrecModule._step_();
				sendOutputs("run");
			} catch (e) {
				console.error("Caught, execution aborted", e?.message || e);
				self.postMessage("error|"+e.message);
			}
        }
    } else if (msg === 'chain') {
		try {
			yrecModule.YREC_return_val = yrecModule._step_();
			sendOutputs("chain");
			self.postMessage("chain|");
		} catch (e) {
			console.error("Caught, execution aborted", e?.message || e);
			self.postMessage("error|"+e.message);
		}
    } else if (msg === 'step') {
		try {
			yrecModule.YREC_return_val = yrecModule._step_();
			sendOutputs("step");
		} catch (e) {
			console.error("Caught, execution aborted", e?.message || e);
			self.postMessage("error|"+e.message);
		}
    } else if (msg === "runall") {
	  const STEP_MS = 100; // adjust interval cadence
	  let stepTimer = null;

	  const startStepping = () => {
		if (stepTimer != null) return;
		stepTimer = setInterval(() => {
		  try {
			sendOutputs("step");
		  } catch (e) {
			console.error("Caught, execution aborted", e?.message || e);
			self.postMessage("error|"+e.message);
			clearInterval(stepTimer);
			stepTimer = null;
		  }
		}, STEP_MS);
		};

	  const stopStepping = () => {
		if (stepTimer != null) {
		  clearInterval(stepTimer);
		  stepTimer = null;
		}
	  };

	  startStepping();

	  setTimeout(() => {
		try {
		  yrecModule.YREC_return_val = yrecModule._MAIN__();
		  stopStepping();
		  sendOutputs("step");
		} catch (e) {
		  stopStepping();
		  console.error("Caught, execution aborted", e?.message || e);
		  self.postMessage("error|" + (e?.message || String(e)));
		}
	  }, 0);
	}


    else if (msg === 'get_track') self.postMessage("track|" + readFileSafe("output/yrec8.track"));
    else if (msg === 'get_full')  self.postMessage("full|"  + readFileSafe("output/yrec8.full"));
    else if (msg === 'get_short') self.postMessage("short|" + readFileSafe("output/yrec8.short"));
    else if (msg === 'get_store') self.postMessage("store|" + readFileSafe("output/yrec8.store"));
    else if (msg === 'get_last')  self.postMessage("last|"  + readFileSafe("output/yrec8.last"));

    else if (msg.startsWith("set_nml1|")) {
        const data = msg.split("|")[1];
        yrecModule.FS.writeFile("run.nml1", new TextEncoder().encode(data));
        yrecModule.FS.writeFile("yrec8.nml1", new TextEncoder().encode(trimComments(data)));
        self.postMessage("nml1|" + readFileSafe("run.nml1"));
    } else if (msg.startsWith("set_nml2|")) {
        const data = msg.split("|")[1];
        yrecModule.FS.writeFile("run.nml2", new TextEncoder().encode(data));
        yrecModule.FS.writeFile("yrec8.nml2", new TextEncoder().encode(trimComments(data)));
        self.postMessage("nml2|" + readFileSafe("run.nml2"));
    } else if (msg.startsWith("get_nml1")) {
        self.postMessage("nml1|" + readFileSafe("run.nml1"));
    } else if (msg.startsWith("get_nml2")) {
        self.postMessage("nml2|" + readFileSafe("run.nml2"));
    }
    else if (msg.startsWith("read_nml1|")) {
        const fname = msg.split("|")[1];
        data = readFileSafe(fname);
        yrecModule.FS.writeFile("run.nml1", new TextEncoder().encode(data));
        yrecModule.FS.writeFile("yrec8.nml1", new TextEncoder().encode(trimComments(data)));
        self.postMessage("nml1|" + readFileSafe("run.nml1"));
    } else if (msg.startsWith("read_nml2|")) {
        const fname = msg.split("|")[1];
        data = readFileSafe(fname);
        yrecModule.FS.writeFile("run.nml2", new TextEncoder().encode(data));
        yrecModule.FS.writeFile("yrec8.nml2", new TextEncoder().encode(trimComments(data)));
        self.postMessage("nml2|" + readFileSafe("run.nml2"));
    }
    else if (msg.startsWith("list_nml1|")) {
        const dirname = msg.split("|")[1];
        self.postMessage("list_nml1|" + fsReadAllExt(dirname, 'nml1'));
    }
    else if (msg.startsWith("list_nml2|")) {
        const dirname = msg.split("|")[1];
        self.postMessage("list_nml2|" + fsReadAllExt(dirname, 'nml2'));
    }
}, false);

function fsReadAllExt(folder, ext) {
    const files = [];

    function impl(curFolder) {
        for (const name of yrecModule.FS.readdir(curFolder)) {
            if (name === '.' || name === '..') continue;

            const path = `${curFolder}/${name}`;
            const { mode, timestamp } = yrecModule.FS.lookupPath(path).node;
            if (yrecModule.FS.isFile(mode) && name.split('.')[name.split('.').length - 1] == ext) {
                files.push(path);
            } else if (yrecModule.FS.isDir(mode)) {
            impl(path);
            }
        }
    }

    impl(folder);
    return files;
}


function readFileSafe(path) {
    try {
        return new TextDecoder().decode(yrecModule.FS.readFile(path));
    } catch (e) {
        console.warn(`Missing file: ${path}`);
        return "";
    }
}

function sendOutputs(tag) {
    self.postMessage("track|" + readFileSafe("output/yrec8.track"));
    self.postMessage("full|"  + readFileSafe("output/yrec8.full"));
    self.postMessage("short|" + readFileSafe("output/yrec8.short"));
    self.postMessage("store|" + readFileSafe("output/yrec8.store"));
    self.postMessage("last|"  + readFileSafe("output/yrec8.last"));
}
