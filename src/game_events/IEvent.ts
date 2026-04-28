export interface IEvent {
    dispatch(dateTime: Date): Promise<void>;
}