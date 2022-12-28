import { ApplicationCommandType, ContextMenuCommandBuilder, SlashCommandBuilder } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { commandDiff } from '../src/host'

const guildId = '839729859098181633'
const handler = (): void => {}

function expectHaving (collection: Array<{ guild?: string, id: string }>, id: string, guild?: string | undefined): void {
  expect(collection.some(it => it.id === id && it.guild === guild)).toBe(true)
}

describe('host command diff', () => {
  it('collects all given new commands when old is []', () => {
    const diff = commandDiff(null,
      {
        slashCommands: {
          slashQuote,
          slashImitate
        },
        contextMenuCommands: {
          menuQuote,
          menuPraise
        }
      })
    expect(diff.remove).toHaveLength(0)
    expect(diff.upsert).toHaveLength(4)
    expectHaving(diff.upsert, 'quote')
    expectHaving(diff.upsert, 'imitate', guildId)
    expectHaving(diff.upsert, 'Quote', guildId)
    expectHaving(diff.upsert, 'Praise')
  })

  it('collects all given old commands when new is []', () => {
    const diff = commandDiff({ slashCommands: { slashQuote, slashImitate }, contextMenuCommands: { menuQuote, menuPraise } }, { slashCommands: {}, contextMenuCommands: {} })
    expect(diff.remove).toHaveLength(4)
    expect(diff.upsert).toHaveLength(0)
    expectHaving(diff.remove, 'quote')
    expectHaving(diff.remove, 'imitate', guildId)
    expectHaving(diff.remove, 'Quote', guildId)
    expectHaving(diff.remove, 'Praise')
  })

  it('collects Old-New into Remove and all in New into Upsert', () => {
    const diff = commandDiff(
      { slashCommands: { slashImitate }, contextMenuCommands: { menuQuote, menuPraise } },
      { slashCommands: { slashQuote }, contextMenuCommands: { menuPraise } }
    )
    expect(diff.remove).toHaveLength(2)
    expect(diff.upsert).toHaveLength(2)
    expectHaving(diff.upsert, 'quote')
    expectHaving(diff.remove, 'imitate', guildId)
    expectHaving(diff.remove, 'Quote', guildId)
    expectHaving(diff.upsert, 'Praise')
  })
})

const slashQuote = {
  builder: new SlashCommandBuilder().setName('quote'),
  handler
}

const slashImitate = {
  guild: guildId,
  builder: new SlashCommandBuilder().setName('imitate').addUserOption(b => b.setName('target').setRequired(true)),
  handler
}

const menuQuote = {
  guild: guildId,
  builder: new ContextMenuCommandBuilder().setName('Quote').setType(ApplicationCommandType.Message),
  handler
}

const menuPraise = {
  builder: new ContextMenuCommandBuilder().setName('Praise').setType(ApplicationCommandType.User),
  handler
}
