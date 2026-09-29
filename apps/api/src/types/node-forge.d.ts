import 'node-forge';

declare module 'node-forge' {
  namespace asn1 {
    // The installed runtime supports options missing from @types/node-forge.
    function fromDer(
      bytes: Bytes | util.ByteBuffer,
      options: { strict?: boolean; parseAllBytes?: boolean; decodeBitStrings?: boolean },
    ): Asn1;
  }
}
