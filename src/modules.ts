import { ApplicationCommandType, Awaitable, ChatInputCommandInteraction, Events, ClientEvents, CommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, SlashCommandBuilder, Client, UserContextMenuCommandInteraction, MessageContextMenuCommandInteraction, ButtonBuilder, GatewayIntentBits } from "discord.js";

/**
 * A set of functions that describes the details of an interaction and how to respond when someone uses it.
 * @template B The type of builder for the interaction that this object describes.
 * @template I The type of interaction that this object describes.
 * @template T Any arbitrary type for the information successfully resolved in the `check` stage to be passed to the `run` stage.
 */
export interface CommandHandlers<B, I extends CommandInteraction, T = void> {
  /**
   * Supply details about the interaction being built.
   * @param builder The builder for you to attach details to.
   */
  build(builder: B): B

  /**
   * Validate the incoming interaction to see whether you should let it take effect.
   * For example, for the quoting module, we would ensure that the message being quoted contains visible text.
   * 
   * If you detect any problems with the interaction and decide that it shouldn't take effect, throw an {@link Error}.
   * 
   * @param interaction The interaction you are responding to.
   */
  check?<T>(interaction: I): T

  /**
   * Fulfill the incoming interaction after it has been checked with {@link check}.
   * @param interaction The interaction you are responding to.
   * @param checkReturnValue The return value of the call to {@link check} with this interaction.
   */
  run(interaction: I, checkReturnValue?: T): string | null
}

/**
 * A module describes a coherent high-level feature, such as quote tracking, class lookups, and schedule sharing.
 * @template Token Type of object that uniquely identifies a command or event handler for tracking and deletion.
 */
export interface IModule<Token> {
  /**
   * A label that uniquely identifies this module in the entire Bot client.
   * During the workshop, the shared client uses this ID to coordinate event handler and command replacements during deployment.
   */
  id: string

  /**
   * Gateway intents required by your module's features.
   * 
   * Gateway intents tell Discord what to notify the bot about. If you include {@link GatewayIntentBits.GuildMessages},
   * for example, then the bot will notify the bot when it witnesses any message in a guild, so if you want to listen
   * for messages from a guild using {@link when}, you would want to include {@link GatewayIntentBits.GuildMessages}.
   */
  intents: GatewayIntentBits[]

  /**
   * Register an event handler.
   * @param event The event(s) that trigger this handler. Choose from {@link Events}.
   * @param handler The function to run when the given event(s) are detected.
   * @returns A token that you can pass to {@link IModule.remove} in order to unregister this event handler.
   * @example mod.when(Events.MessageCreate, msg => msg.react('✨'));
   * @example mod.when([Events.MessageUpdate, Events.MessageDelete], async msg => await msg.channel.send('sneaky!'));
   */
  when<K extends keyof ClientEvents>(event: K|K[], handler: (...args: ClientEvents[K]) => Awaitable<any>): Token

  /**
   * Register an event handler that only runs at most once.
   * @param event The event(s) that trigger this handler once. Choose from {@link Events}.
   * @param handler The function to run when the given event(s) are detected for the first time.
   * @returns A token that you can pass to {@link IModule.remove} in order to unregister this event handler.
   * @example mod.once(Events.Error, () => process.exit(1));
   */
  once<K extends keyof ClientEvents>(event: K|K[], handler: (...args: ClientEvents[K]) => Awaitable<any>): Token
  
  /**
   * Create a slash (/) command.
   * @param command The command itself without the leading slash. For example, `"nick"` refers to the command `/nick`.
   * @param description A brief description of this command that is shown with this command when a user types it.
   * @param handlers Functions that specify the details of this command and how to react when someone uses it.
   * @returns A token that you can pass to {@link IModule.remove} in order to remove this slash command.
   */
  slash<T>(command: string, description: string, handlers: CommandHandlers<SlashCommandBuilder, ChatInputCommandInteraction, T>): Token

  /**
   * Create a context menu item.
   * @param label The text label of the menu item to add.
   * @param type The type of entity to attach this menu item to. Do you want users to see this item when they right click on users or on messages?
   * @param handlers Functions that specify the details of this menu command and how to react when someone uses it.
   * @returns A token that you can pass to {@link IModule.remove} in order to remove this menu item.
   */
  menu<T, I extends ApplicationCommandType.User | ApplicationCommandType.Message>(label: string,
      type: I,
      handlers: CommandHandlers<ContextMenuCommandBuilder,
          I extends ApplicationCommandType.User ? UserContextMenuCommandInteraction : MessageContextMenuCommandInteraction, T>): Token

  /**
   * Unregister or remove an event handler, command, or context menu item.
   * @param handler The token returned by the function that created the event handler, command, or other interaction you want to remove.
   */
  remove(handler: Token): boolean
  
  /**
   * The underlying client instance hosting this module. Use this to access guild managers, create DM channels, manage the bot's presence, etc.
   */
  client: Client<true>
}