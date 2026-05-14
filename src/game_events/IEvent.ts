export interface IEvent {
    dispatch(dateTime: string): Promise<void>;
}