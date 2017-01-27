// function main() {
//   $('.fonts').hide();
//   $('.fonts').fadeIn(1000);
// }
// $(document).ready(main()){
//
// }

var numbers = (Math.floor(Math.random() * 100));
// window.onload=(alert("I am an alert box!"));

var range = [];
for (var i = 0; i < 5; i++) {
  var randoms = (Math.floor(Math.random() * 100));
  range.push(randoms).toString();
  document.getElementById("output1").innerHTML = range.toString();
}

var morningAlarm = ['7:50AM', '7:40AM', '7:30AM'];
for (var i = 0; i < morningAlarm.length; i++) {
  var tekst = ('Morning alarm ' + (i+1) + ' is set to:' + morningAlarm[i] + '<br>');
  document.getElementById("output2").innerHTML += tekst.toString();
}


// var fruits, text, fLen, i;
//
// fruits = [];
// fruits.fill(numbers);
// // fLen = fruits.length;
// text = "<ul>";
// for (i = 0; i < 5; i++) {
//     text += "<li>" + fruits[i] + "</li>";
// }
// text += "</ul>";
var needCoffee = true;

function setTrue()
{
  needCoffee = true;
}
function setFalse()
{
  needCoffee = false;
}

function youNeedCoffee(){
switch (needCoffee) {
  case true:
  needCoffee = false;
      document.getElementById("output3").innerHTML = 'Yep.. You need Coffee';
      //setTimeOut(setTrue(), 3000);
      break;

  case false:
  needCoffee = true;
      document.getElementById("output3").innerHTML = 'Wait just a lil \' bit longer';
      //setTimeOut(setFalse(), 3000);
      break;

  default:
  document.getElementById("output3").innerHTML = 'Something went horribly wrong !';
  document.getElementById("output4").innerHTML = 'Something went horribly wrong x 2 !';
}
}

//get random cards till spade
function getCards(){
var cards = ['Diamond', 'Spade', 'Heart', 'Club']; //Array of cards
document.getElementById("output5").innerHTML = ''; // Clearing output5
var currentCard = ''; // Set currentCard
var countedCards = 0; // Set countedCards
while(currentCard !== 'Spade') // Search till Spade
  {
      var randomNumber = Math.floor(Math.random() * 4);
      document.getElementById("output5").innerHTML += currentCard + '<br>';
      countedCards++;

      currentCard = cards[randomNumber];
  }
document.getElementById("output5").innerHTML += ' Spade <br> Counted cards: ' + countedCards; //Output Spade and countedCards
}

// function testForCondition(){
//   if (needCoffee = true) {
//     youNeedCoffee();
//   } else {
//
//   }
// }



function apples(one,two){
  var outcome = ('Number ' + one + ' is better than Number ' + two);
  document.getElementById("output4").innerHTML = outcome;
}
apples('1', '2');

var groceryItem = 'banana';

switch(groceryItem){
  case 'banana':
  console.log();
}



// var stopLight = 'green';
//
// if (stopLight === 'red') {
//   console.log('Stop');
// } else if (stopLight === 'yellow') {
//   console.log('Slow down');
// } else if (stopLight === 'green') {
//   console.log('Go!');
// } else {
//   console.log('Caution, unknown!');
// }

// Order_Pizza.js
// var orderCount = 0;
//
// function takeOrder(topping, crustType)
// {
//   orderCount++;
//   console.log('Order: ' + crustType + ' pizza topped with ' + topping);
// }
//
//
//   takeOrder('bacon', 'thin crust');
//   takeOrder('tomatoes', 'meat crust');
//   takeOrder('chrorizo', 'black crust');
//
// console.log(getSubTotal(orderCount));
//
// function getSubTotal(itemCount)
// {
//   return (itemCount * 7.5);
// }
//
// function getTax()
// {
//   return (getSubTotal(orderCount) * 0.06);
// }
//
// function getTotal()
// {
//   return (getSubTotal(orderCount) + getTax());
// }
//
// console.log(getTotal());

// Print array
// var bucketList = ['Parachute', 'Go to the Casino', 'Good career'] ;
//
// for(i=0;i<3;i++)
//   {
//     var listItem = bucketList[i];
//     console.log(listItem);
//   }

//Loop over an array
// fruits.forEach(function (item, index, array) {
//   console.log(item, index);
// });
