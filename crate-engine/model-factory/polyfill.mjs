globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(ab => {
      this.result = ab;
      if (this.onloadend) this.onloadend();
      if (this.onload) this.onload({ target: this });
    });
  }
  addEventListener(evt, fn) { this['on' + evt] = fn; }
};
