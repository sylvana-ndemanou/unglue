import React, {type ReactNode} from 'react'
import {Box, Text} from 'ink'
import {theme} from '../theme.js'

/** Total columns a framed-input button occupies (label + 2 cells padding per side). */
export const frameButtonWidth = (label: string) => label.length + 4

/**
 * A single-line input frame with the title sitting on the top border,
 * like `╭─ Paste a link ────╮`. Drawn by hand because ink borders
 * don't support embedded titles.
 *
 * `button` renders a filled block forged onto the right edge: the frame
 * drops its own right border and its lines run straight into the block, so
 * input and button read as one control. Half-blocks on the outer rows keep
 * the fill optically the same height as the thin frame borders. Clicks are
 * not handled here — the app hit-tests mouse events against the block's
 * position (see app.tsx). `buttonDim` shows the pressed/loading state.
 */
export function FramedInput({
  title,
  width,
  button,
  buttonDim = false,
  children,
}: {
  title: string
  width: number
  button?: string
  buttonDim?: boolean
  children: ReactNode
}) {
  const inner = width - 2
  const tail = Math.max(0, inner - title.length - 3)
  const buttonW = button ? frameButtonWidth(button) : 0
  const fillColor = buttonDim ? theme.gray : theme.primary
  return (
    <Box width={width + buttonW}>
      <Box flexDirection="column" width={width}>
        <Text>
          <Text color={theme.gray}>{'╭─ '}</Text>
          <Text color={theme.primary}>{title}</Text>
          <Text color={theme.gray}>{` ${'─'.repeat(tail)}${button ? '─' : '╮'}`}</Text>
        </Text>
        <Box width={width} height={1} overflow="hidden">
          <Text color={theme.gray}>│ </Text>
          <Text color={theme.primary}>❯ </Text>
          <Box flexGrow={1} height={1} overflow="hidden">
            {children}
          </Box>
          {button ? null : <Text color={theme.gray}> │</Text>}
        </Box>
        <Text color={theme.gray}>{`╰${'─'.repeat(inner)}${button ? '─' : '╯'}`}</Text>
      </Box>
      {button ? (
        <Box flexDirection="column" width={buttonW}>
          <Text color={fillColor}>{'▄'.repeat(buttonW)}</Text>
          <Text backgroundColor={fillColor} color={theme.dark} bold>{`  ${button}  `}</Text>
          <Text color={fillColor}>{'▀'.repeat(buttonW)}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
