const Binance = require('node-binance-api');

const binance = new Binance().options({
  APIKEY: process.env.APIKEY,
  APISECRET: process.env.APISECRET
});

var market = "BTCUSDT";


Array.prototype.max = function() {
  return Math.max.apply(null, this);
};

Array.prototype.min = function() {
  return Math.min.apply(null, this);
};

var cancelAllOrders = async() => {
	return await binance.futuresCancelAll(market)
}

var marketBuy = async (qty, leverage, isClose) => {
	qty = qty.toFixed(3)


    const adjustMarginTypeResp = await binance.futuresMarginType(market, "CROSSED")
    const adjustLeverageResp = await binance.futuresLeverage(market, leverage)

    buyResp = 0;

    if (isClose == true)
    	buyResp = await binance.futuresMarketBuy(market, 0.001, {reduceOnly: true});
    else 
    	buyResp = await binance.futuresMarketBuy(market, qty);

    return buyResp 
}

var sleep = async (ms) => {
	return await new Promise(r => setTimeout(r, ms));
}

var marketSell = async (qty, isClose) => {
	qty = qty.toFixed(3)

	const params = {
        reduceOnly: true
    }
    const adjustMarginTypeResp = await binance.futuresMarginType(market, "CROSSED")
    sellResp = 0;

    if (isClose == true)
    	sellResp = await binance.futuresMarketSell(market, 0.001, {reduceOnly: true});
    else
    	sellResp = await binance.futuresMarketSell(market, qty);

    return sellResp 
}

var getPositionAmt = async () => {
	var list = await binance.futuresPositionRisk();

	var positionAmt = 0;
	list.forEach(function (position) {
		if (position.symbol == market) {
			positionAmt = position.positionAmt;
		}
	})
	return parseFloat(positionAmt);
}

var getPositionProfit = async () => {
	var list = await binance.futuresPositionRisk();

	var profit = 0;
	list.forEach(function (position) {
		if (position.symbol == market) {
			profit = position.unRealizedProfit;
		}
	})
	return parseFloat(profit);
}

var getPositionSide = async () => {
	var amt = parseFloat(await getPositionAmt());

	if (amt > 0 )
		return "BUY"
	else
		return "SELL"
}


var closePosition = async () => {
	var side = await getPositionSide();
	var qty = await getPositionAmt();
	console.log("trying to close position with qty", qty);
	sleep(1000);
	if(side == "SELL") {
		return await marketBuy(qty, 5, true)
	} else {
		return await marketSell(qty, true)
	}

}

var getCandleSticks = async (time) => {
	var sticks = await binance.candlesticks(market, time);
	var results = [];

	sticks.forEach(function (stick) {
		results.push([parseFloat(stick[1]),
			parseFloat(stick[2]),
				parseFloat(stick[3]),
					parseFloat(stick[4])]);
	});
	return results;
}

var getHeikinAsihi = async (time) => {
	var sticks = await getCandleSticks(time);
	var result = [];
    var ctr = 0;
	sticks.forEach(function (stick) {
		// [open, high, low, close]
		var close_price = (stick[0] + stick[1] + stick[2] + stick[3]) / 4;
		var open_price = 0;

		if (ctr == 0)
			open_price = close_price;
		else
			open_price = (result[ctr-1][0] + result[ctr-1][3])/2;

		var high_price = [stick[1], close_price, open_price].max();
		var low_price = [stick[2], close_price, open_price].min();



		result.push([open_price, high_price, low_price, close_price]);

		ctr++;
	});
	return result;
}


var talonSniper = async (hArray) => {
    var factor = 1
    var pd = 1
    
    // calculate hl2
    var hl2 = [];
    for (i = 0; i < hArray.length; i++)
    	hl2.push ( (hArray[i][1] + hArray[i][2]) /2 );
    hl2.shift();
    

    // calculate average true range
    var atr = [];
    for (i = 0; i < hArray.length; i++) {
    	if (i!= 0)
    		atr.push([ hArray[i][1] - hArray[i][2],
    		 Math.abs(hArray[i][1] - hArray[i-1][3]),
    		  Math.abs(hArray[i][2] - hArray[i-1][3])].max());
    }

    //calculate up
    var up = [];
    for (i = 0; i < hl2.length; i++)
    	up.push(hl2[i] - (factor*atr[i]));

    //calculate dn
    var dn = [];
    for (i = 0; i < hl2.length; i++)
    	dn.push(hl2[i] + (factor*atr[i]));
    
   
    // calculate trend up and trend down
    var trend_up = [];
    var trend_down = [];
    trend_up.push(0);
    trend_down.push(0);


    for (i = 1; i < hArray.length; i++) {
    	if(hArray[i][3] > trend_up[i-1]) 
    		trend_up.push([up[i],trend_up[i-1]].max());
    	else
    		trend_up.push(up[i]);

    	if(hArray[i][3] < trend_down[i-1])
    		trend_down.push([dn[i], trend_down[i-1]].min());
    	else
    		trend_down.push(dn[i])
    }
    
	//calculate trend
    var trend = []
    var last = 0

    for (var i = 1; i < hArray.length; i++) {
    	var tr = 0;
    	if(hArray[i][3] > trend_down[i-1]){
    		tr = 1;
    		last = tr;
    	}
    	else if(hArray[i][3] < trend_up[i-1]){
    		tr = -1;
    		last = tr;
    	}
    	else {
    		tr = last
    	}
    	trend.push(tr);
    }
    

    //calculate entry
    var entry = []
    entry.push(0);
  
    last = 0

    for (i = 1; i < trend.length; i++) {
    	if(trend[i] == 1 && trend[i-1] == -1){
    		last = 1;
    		entry.push(1);
    	}
    	else if(trend[i] == -1 && trend[i-1] == 1){
    		last = -1;
    		entry.push(-1);
    	}
    	else {
    		entry.push(last)
    	}

    }
    
    return entry;
}

const start = async function() {

	var ctr = 0;



	while(true) {
		console.log("iteration ", ctr++);
		var isInPosition = await getPositionAmt();

		// var sticks = await getHeikinAsihi("3m");
		// var signal1 = await talonSniper(sticks);


		var sticks2 = await getHeikinAsihi("5m");
		var signal2 = await talonSniper(sticks2);

		var sticks3 = await getHeikinAsihi("15m");
		var signal3 = await talonSniper(sticks3);


		var final_signal =[];

		for (i=0; i<signal2.length;i++)
			final_signal.push( parseInt((signal2[i] + signal3[i]) /2));


		var signal = final_signal;
		console.log(signal.reverse());
		signal.reverse();// reset signal after printing.

		// if not in position
		if (isInPosition == 0) {
			if (signal[signal.length - 1] == 1) {
				console.log("Going for buy, signal is long", await marketBuy(0.001, 5, false));
			} else if (signal[signal.length - 1] == -1) {
				console.log("Going for sell, signal is short", await marketSell(0.001, 5, false));
			} else {
				console.log("do nothing");
			}


		} else {
			console.log("in position")
			// check if not profitiable && close position before it bleeds
			var profit = await getPositionProfit();

			console.log("profit is", profit);
			
			//if over thresholds
			if ( profit > 0.1) {
				console.log("made profit", 	await closePosition());
			} else if (profit < -0.1) {
				console.log("cutting loss", await closePosition());
				// await sleep(60000); // made a mistake.. give it 60 seconds before making another mistake

			}

			//if our signal is completely wrong, close poition
			var side = await getPositionSide();
			if( (side == "SELL" && signal[signal.length - 1] == 1) ||
				(side == "BUY" && signal[signal.length - 1] == -1) ) {
				console.log("Side is different from signal ", side, ", ", signal[signal.length-2]);
			    console.log(await closePosition());

			}
		}

		await sleep(10000);
	}


}

start();

    // console.log("buyResp ===>>", buyResp)