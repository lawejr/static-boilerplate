export class DOM {
  static get body(): HTMLBodyElement | null {
    const elements = document.getElementsByTagName("body")
    return elements.length ? elements[0] : null
  }
}
