export default abstract class Rule {

    constructor(){}


    type = 'league';
    circle = 2;

    timeslots = [
        {
            day: 'friday',
            time: [{hour:19, minute: 30, prime_time: 1}]
        },
        {
            day: 'satuday',
            time: [
                {hour:17, minute: 30, prime_time: 2},
                {hour:19, minute: 30, prime_time: 2},
                {hour:22, minute: 0, prime_time: 3}
            ]
        },
        {
            day: 'sunday',
            time: [
                {hour:17, minute: 30, prime_time: 2},
                {hour:19, minute: 30, prime_time: 2},
                {hour:22, minute: 0, prime_time: 10}
            ]
        }
    ];

    reserve_slots = [
        {day: 'wensday', time: [{hour:22, minute: 0, prime_time: 0}]}
    ]

    draw_date = {day: '20.07', time: '17:00'}
}