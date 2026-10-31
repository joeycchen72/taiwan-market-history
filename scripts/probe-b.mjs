// Temporary: check the official endpoints needed for B-class data (prints a short sample of each).
const U=[
 ['twse-qfii','https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date=20150302&selectType=ALLBUT0999&response=json'],
 ['twse-margin','https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=20150302&selectType=ALL&response=json'],
 ['twse-pe','https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20150302&selectType=ALL&response=json'],
 ['tpex-margin','https://www.tpex.org.tw/www/zh-tw/margin/balance?date=2015%2F03%2F02&response=json'],
 ['tpex-pe','https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=2015%2F03%2F02&response=json'],
 ['tpex-qfii','https://www.tpex.org.tw/www/zh-tw/insti/qfii?date=2015%2F03%2F02&response=json'],
 ['rev-sii','https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_104_2_0.html'],
 ['rev-otc','https://mopsov.twse.com.tw/nas/t21/otc/t21sc03_104_2_0.html'],
 ['rev-sii-new','https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_115_9_0.html'],
];
for(const [k,u] of U){try{const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 (research; github.com/joeycchen72/taiwan-market-history)'},signal:AbortSignal.timeout(30000)});const b=Buffer.from(await r.arrayBuffer());let t=b.toString('utf8');if(/charset=big5/i.test(t.slice(0,800))||k.startsWith('rev'))t=new TextDecoder('big5').decode(b);
 console.log('=== '+k+' '+r.status+' '+(r.headers.get('content-type')||'')+' len='+b.length);console.log(t.replace(/\s+/g,' ').slice(0,k.startsWith('rev')?2500:1500));}catch(e){console.log('=== '+k+' ERR '+e.message);}await new Promise(r=>setTimeout(r,5000));}
