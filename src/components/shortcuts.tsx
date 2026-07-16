import React, {type ReactNode} from 'react'
import {Text} from 'ink'
import {theme} from '../theme.js'

/** `leading` renders before the shortcut items, joined by the same `·`. */
export function Shortcuts({items, leading}: {items: Array<[key: string, label: string]>; leading?: ReactNode}) {
  return (
    <Text>
      {leading ? (
        <>
          {leading}
          <Text color={theme.gray}>{'  ·  '}</Text>
        </>
      ) : null}
      {items.map(([key, label], index) => (
        <Text key={`${key}-${label}`}>
          {index > 0 ? <Text color={theme.gray}>{'  ·  '}</Text> : null}
          <Text color={theme.primary}>{key}</Text>
          <Text color={theme.gray}> {label}</Text>
        </Text>
      ))}
    </Text>
  )
}
