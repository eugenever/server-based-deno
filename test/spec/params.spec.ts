import { Blob } from 'buffer'
import querystring from 'querystring'

import 'jest'
import { JSDOM } from 'jsdom'
import { nanoid } from 'nanoid'
import { sign } from 'jsonwebtoken'
import { ContentType } from 'allure-js-commons'

import { FunctionsClient } from '@supabase/functions-js'

import { Relay, runRelay } from '../relay/container'
import { attach, log } from '../utils/jest-custom-reporter'
import { str2ab } from '../utils/binaries'
import { MirrorResponse } from '../models/mirrorResponse'

const port = 9000

describe('params reached to function', () => {
  let relay: Relay
  const jwtSecret = nanoid(10)
  const apiKey = sign({ name: 'anon' }, jwtSecret)

  beforeAll(async () => {
    relay = await runRelay({})
  })

  afterAll(async () => {
    relay && relay.container && (await relay.container.stop())
  })

  test('invoke mirror', async () => {
    /**
     * @feature core
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    log('invoke mirror')
    const { data, error } = await fclient.invoke<MirrorResponse>('mirror', {})

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(port)}/mirror`,
      method: 'POST',
      headers: data?.headers ?? [],
      body: '',
    }
    attach(
      'check data from function',
      `expected: ${JSON.stringify(expected)}\n actual: ${JSON.stringify(data)}`,
      ContentType.TEXT
    )
    expect(data).toEqual(expected)
  })

  test('invoke mirror with client header', async () => {
    /**
     * @feature headers
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        CustomHeader: 'check me',
      },
    })

    log('invoke mirror')
    const { data, error } = await fclient.invoke<MirrorResponse>('mirror', {})

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(port)}/mirror`,
      method: 'POST',
      headers: data?.headers ?? [],
      body: '',
    }
    attach(
      'check data from function',
      `expected: ${JSON.stringify(expected)}\n actual: ${JSON.stringify(data)}`,
      ContentType.TEXT
    )
    expect(data).toEqual(expected)
    attach(
      'check headers from function',
      `expected to include: ${['customheader', 'check me']}\n actual: ${JSON.stringify(
        data?.headers
      )}`,
      ContentType.TEXT
    )
    expect(
      (data?.headers as [Array<string>]).filter(
        ([k, v]) => k === 'customheader' && v === 'check me'
      ).length > 0
    ).toBe(true)
  })

  test('invoke mirror with invoke header', async () => {
    /**
     * @feature headers
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`)

    log('invoke mirror')
    const customHeader = nanoid()
    const { data, error } = await fclient.invoke<MirrorResponse>('mirror', {
      headers: {
        'custom-header': customHeader,
        Authorization: `Bearer ${apiKey}`,
      },
    })

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(port)}/mirror`,
      method: 'POST',
      headers: data?.headers ?? [],
      body: '',
    }
    attach(
      'check data from function',
      `expected: ${JSON.stringify(expected)}\n actual: ${JSON.stringify(data)}`,
      ContentType.TEXT
    )
    expect(data).toEqual(expected)
    attach(
      'check headers from function',
      `expected to include: ${['custom-header', customHeader]}\n actual: ${JSON.stringify(
        data?.headers
      )}`,
      ContentType.TEXT
    )
    expect(
      (data?.headers as [Array<string>]).filter(
        ([k, v]) => k === 'custom-header' && v === customHeader
      ).length > 0
    ).toBe(true)
  })

  test('invoke mirror with body formData', async () => {
    /**
     * @feature body
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`)
    attach('setAuth', apiKey, ContentType.TEXT)
    fclient.setAuth(apiKey)

    log('invoke mirror')
    const form = new FormData()
    const formData = [
      [nanoid(5), nanoid(10)],
      [nanoid(7), nanoid(5)],
      [nanoid(15), nanoid()],
    ]
    formData.forEach((e) => form.append(e[0], e[1]))

    const { data, error } = await fclient.invoke<MirrorResponse>('mirror', {
      body: form,
      headers: {
        'response-type': 'form',
      },
    })

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(port)}/mirror`,
      method: 'POST',
      headers: data?.headers ?? [],
      body: formData,
    }
    attach(
      'check data from function',
      `expected: ${JSON.stringify(expected)}\n actual: ${JSON.stringify(data)}`,
      ContentType.TEXT
    )
    expect(data).toEqual(expected)
  })

  test('invoke mirror with body json', async () => {
    /**
     * @feature body
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`)
    attach('setAuth', apiKey, ContentType.TEXT)
    fclient.setAuth(apiKey)

    log('invoke mirror')
    const body = {
      one: nanoid(10),
      two: nanoid(5),
      three: nanoid(),
      num: 11,
      flag: false,
    }
    const { data, error } = await fclient.invoke<MirrorResponse>('mirror', {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        'response-type': 'json',
      },
    })

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(port)}/mirror`,
      method: 'POST',
      headers: data?.headers ?? [],
      body: body,
    }
    attach(
      'check data from function',
      `expected: ${JSON.stringify(expected)}\n actual: ${JSON.stringify(data)}`,
      ContentType.TEXT
    )
    expect(data).toEqual(expected)
  })

  test('invoke mirror with body arrayBuffer', async () => {
    /**
     * @feature body
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`)
    attach('setAuth', apiKey, ContentType.TEXT)
    fclient.setAuth(apiKey)

    log('invoke mirror')
    const body = {
      one: nanoid(10),
      two: nanoid(5),
      three: nanoid(),
      num: 11,
      flag: false,
    }
    const arrayBuffer = str2ab(JSON.stringify(body))
    const { data, error } = await fclient.invoke<MirrorResponse>('mirror', {
      body: arrayBuffer,
      headers: {
        'content-type': 'application/octet-stream',
        'response-type': 'arrayBuffer',
      },
    })

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(port)}/mirror`,
      method: 'POST',
      body: arrayBuffer,
    }
    expect(data).toMatchObject(expected)
  })

  test('invoke mirror with body blob', async () => {
    /**
     * @feature body
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`)
    attach('setAuth', apiKey, ContentType.TEXT)
    fclient.setAuth(apiKey)

    log('invoke mirror')
    const body = {
      one: nanoid(10),
      two: nanoid(5),
      three: nanoid(),
      num: 11,
      flag: false,
    }
    const bodyEncoded = str2ab(JSON.stringify(body))
    const { data, error } = await fclient.invoke<MirrorResponse>('mirror', {
      body: bodyEncoded,
      headers: {
        'content-type': 'application/octet-stream',
        'response-type': 'blob',
      },
    })

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(port)}/mirror`,
      method: 'POST',
      body: bodyEncoded,
    }
    expect(data).toMatchObject(expected)
  })

  test('invoke mirror with url params', async () => {
    /**
     * @feature body
     */
    log('create FunctionsClient')
    const fclient = new FunctionsClient(`http://localhost:${relay.container.getMappedPort(port)}`)
    attach('setAuth', apiKey, ContentType.TEXT)
    fclient.setAuth(apiKey)

    log('invoke mirror')
    const body = {
      one: nanoid(10),
      two: nanoid(5),
      three: nanoid(),
      num: '11',
      flag: 'false',
    }
    const queryParams = new URLSearchParams(body)
    const { data, error } = await fclient.invoke<MirrorResponse>(
      `mirror?${queryParams.toString()}`,
      {}
    )

    log('assert no error')
    expect(error).toBeNull()

    const expected = {
      url: `http://localhost:${relay.container.getMappedPort(
        port
      )}/mirror?${queryParams.toString()}`,
      method: 'POST',
    }
    expect(data).toMatchObject(expected)
  })
})
