import assert from 'node:assert/strict';
import test from 'node:test';
import {
  imageProtocolSource,
  toImageProtocolUrl,
} from '../src/common/utils/imageProtocol';

test('SuperX exposes local plugin logos through the image protocol', () => {
  assert.equal(
    toImageProtocolUrl('file://D:/Plugins/demo/logo.png'),
    'image://local/?src=file%3A%2F%2FD%3A%2FPlugins%2Fdemo%2Flogo.png'
  );
  assert.equal(
    toImageProtocolUrl('D:\\Plugins\\demo\\logo.png'),
    'image://local/?src=D%3A%5CPlugins%5Cdemo%5Clogo.png'
  );
  assert.equal(
    toImageProtocolUrl('/opt/flick/demo/logo.png'),
    'image://local/?src=%2Fopt%2Fflick%2Fdemo%2Flogo.png'
  );
});

test('image protocol round-trips Windows paths with spaces and unicode', () => {
  const source = 'C:\\插件目录\\with space\\logo.png';
  assert.equal(imageProtocolSource(toImageProtocolUrl(source)), source);
  assert.equal(
    imageProtocolSource('image://D:\\Project\\rubick\\public\\logo.png'),
    'D:\\Project\\rubick\\public\\logo.png'
  );
});

test('SuperX leaves renderer-safe plugin logo sources unchanged', () => {
  const sources = [
    'image://D:/Plugins/demo/logo.png',
    'https://example.com/logo.png',
    'data:image/png;base64,abc',
    'blob:http://localhost/logo',
  ];

  for (const source of sources) {
    assert.equal(toImageProtocolUrl(`  ${source}  `), source);
  }
  assert.equal(toImageProtocolUrl(''), '');
});
