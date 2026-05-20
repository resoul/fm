export default function dayIndexDate(date: Date): number{
    return  Number(`${date.getDate()}11${date.getMonth()}`);
}