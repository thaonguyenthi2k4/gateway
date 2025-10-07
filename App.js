import React, { Component } from 'react';
import Web3 from 'web3';
import Nav from './Components/Nav';
import Description from './Components/Description';
import Container from './Components/Container';
import Shoes from './Items/all';

// ⏳ fetch có timeout (không dùng AbortController)
function fetchWithTimeout(url, options, ms) {
  if (typeof ms !== 'number') ms = 10000; // mặc định 10s
  return Promise.race([
    fetch(url, options || {}),
    new Promise(function (resolve, reject) {
      setTimeout(function () {
        reject(new Error('Timeout after ' + ms + 'ms'));
      }, ms);
    }),
  ]);
}

class App extends Component {
  constructor() {
    super();
    this.appName = 'Sindbad Commerce';
    this.shoes = Shoes;

    this.closePayment = this.closePayment.bind(this);
    this.PaymentWait = this.PaymentWait.bind(this);
    this.resetApp = this.resetApp.bind(this);
    this.componentDidMount = this.componentDidMount.bind(this);

    this.state = {
      shoes: [],
      PaymentDetail: {},
      Conv: 300,
      defaultGasPrice: null, // lưu ở wei
      defaultGasLimit: 200000,
      paymentf: false,
      mAddress: '0x',
      amount: 0,
      diff: 0,
      seconds: '00',
      minutes: '15',
      tflag: true,
      errorMsg: null,
    };
  }

  // ======== ACTIONS ========

  newPayment = async (index) => {
    if (index == null || !this.state.shoes[index]) {
      this.setState({ errorMsg: 'Sản phẩm không hợp lệ.' });
      return;
    }

    try {
      // 1) Lấy mAddress từ backend (dùng đường dẫn tương đối -> proxy CRA sẽ chuyển sang http://localhost:5000)
      const addrRes = await fetchWithTimeout('/api/getMAddress', {}, 10000);
      if (!addrRes.ok) {
        throw new Error('API ' + addrRes.status + ' ' + addrRes.statusText);
      }
      const addrJson = await addrRes.json();
      const mAddr = addrJson.MAddress;

      // 2) Lấy tỷ giá ETH→USD (HTTPS để tránh mixed content)
      const rateRes = await fetchWithTimeout(
        'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD',
        {},
        10000
      );
      if (!rateRes.ok) {
        throw new Error('Rate ' + rateRes.status + ' ' + rateRes.statusText);
      }
      const rateJson = await rateRes.json();
      const conv = rateJson.USD;

      this.setState({
        PaymentDetail: this.state.shoes[index],
        mAddress: mAddr,
        Conv: conv,
        errorMsg: null,
      });
    } catch (err) {
      console.error('newPayment failed:', err);
      this.setState({
        PaymentDetail: {},
        mAddress: '0x',
        errorMsg:
          err && err.message
            ? 'Không gọi được API: ' + err.message
            : 'Không gọi được API.',
      });
    }
  };

  closePayment() {
    clearInterval(this.intervalHandle);
    clearInterval(this.intervalBalance);

    this.setState({
      PaymentDetail: {},
      paymentf: false,
      mAddress: '0x',
      amount: 0,
      diff: 0,
      seconds: '00',
      minutes: '15',
      tflag: true,
      defaultGasPrice: null,
      defaultGasLimit: 200000,
      errorMsg: null,
    });
  }

  PaymentWait(mAddress, amount) {
    this.setState({
      paymentf: true,
      amount: amount,
      mAddress: mAddress,
    });
  }

  resetApp() {
    this.setState({
      PaymentDetail: {},
      paymentf: false,
      mAddress: '0x',
      amount: 0,
      diff: 0,
      seconds: '00',
      minutes: '15',
      tflag: true,
      defaultGasPrice: null,
      defaultGasLimit: 200000,
      errorMsg: null,
    });
  }

  setGasPrice = (web3) => {
    web3.eth.getGasPrice((err, priceWei) => {
      if (!err) {
        this.setState({ defaultGasPrice: priceWei.toString() });
      } else {
        console.log(err);
      }
    });
  };

  MMaskTransfer = (MRAddress, amount) => {
    var app = this;

    if (!window.ethereum) {
      this.setState({
        errorMsg: 'Không phát hiện ví (MetaMask) trên trình duyệt.',
      });
      return;
    }

    var ethereum = window.ethereum;
    var web3 = new Web3(ethereum);

    ethereum
      .request({ method: 'eth_requestAccounts' })
      .then(function (accounts) {
        var account = accounts[0];
        web3.eth.defaultAccount = account;

        if (!app.state.defaultGasPrice) {
          app.setGasPrice(web3);
        }

        var valueWei = '0';
        try {
          valueWei = web3.utils.toWei(String(amount), 'ether');
        } catch (e) {
          app.setState({ errorMsg: 'Số tiền không hợp lệ.' });
          return;
        }

        var tx = {
          from: account,
          to: MRAddress,
          gas: app.state.defaultGasLimit,
          gasPrice: app.state.defaultGasPrice || undefined, // wei string
          value: valueWei, // wei string
        };

        web3.eth.sendTransaction(tx, function (error, result) {
          if (!error) {
            console.log('tx hash:', result);
            app.resetApp();
          } else {
            console.log('sendTransaction error:', error);
            app.setState({
              errorMsg:
                (error && error.message) ? error.message : 'Gửi giao dịch thất bại.',
            });
          }
        });
      })
      .catch(function (err) {
        console.error('eth_requestAccounts error:', err);
        app.setState({ errorMsg: 'Không thể truy cập tài khoản MetaMask.' });
      });
  };

  tick = () => {
    var min = Math.floor(this.secondsRemaining / 60);
    var sec = this.secondsRemaining - min * 60;

    this.setState({
      minutes: min < 10 ? '0' + min : String(min),
      seconds: sec < 10 ? '0' + sec : String(sec),
    });

    if (min === 0 && sec === 0) {
      clearInterval(this.intervalHandle);
      clearInterval(this.intervalBalance);
    }

    this.secondsRemaining = Math.max(0, this.secondsRemaining - 1);
  };

  bCheck = () => {
    var app = this;
    var amountEth = Number(this.state.amount) || 0;

    this.web3 = new Web3(
      new Web3.providers.HttpProvider('http://localhost:8545')
    );

    this.web3.eth.getBalance(this.state.mAddress, function (error, resultWei) {
      if (!error) {
        var diffEth = Number(app.web3.utils.fromWei(resultWei, 'ether'));
        if (diffEth >= amountEth) {
          clearInterval(app.intervalHandle);
          clearInterval(app.intervalBalance);
        }
        app.setState({ diff: diffEth });
      } else {
        console.log(error);
      }
    });
  };

  startTimer = () => {
    if (this.state.tflag === true) {
      var time = parseInt(this.state.minutes, 10) || 0;
      this.secondsRemaining = time * 60;

      this.intervalHandle = setInterval(this.tick, 1000);
      this.intervalBalance = setInterval(this.bCheck, 10000);

      this.setState({ tflag: false });
    }
  };

  // ======== LIFECYCLE ========

  componentDidMount() {
    const shoes = Shoes.map(function ({ logo, price, image, name }) {
      return { logo: logo, price: price, image: image, name: name };
    });
    this.setState({ shoes: shoes });
  }

  // ======== RENDER ========

  render() {
    return (
      <div>
        <Nav appName={this.appName} />
        <div></div>
        <Description />

        {this.state.errorMsg && (
          <div className="notification is-danger" style={{ margin: '12px' }}>
            {this.state.errorMsg}
          </div>
        )}

        <Container
          shoes={this.state.shoes}
          newPayment={this.newPayment}
          closePayment={this.closePayment}
          PaymentDetail={this.state.PaymentDetail}
          mAddress={this.state.mAddress}
          amount={this.state.amount}
          diff={this.state.diff}
          paymentf={this.state.paymentf}
          Conv={this.state.Conv}
          MMaskTransfer={this.MMaskTransfer}
          PaymentWait={this.PaymentWait}
          startTimer={this.startTimer}
          tick={this.tick}
          privateToAddress={this.privateToAddress}
          getRandomWallet={this.getRandomWallet}
          defaultGasPrice={this.state.defaultGasPrice}
          defaultGasLimit={this.state.defaultGasLimit}
          minutes={this.state.minutes}
          seconds={this.state.seconds}
        />
      </div>
    );
  }
}

export default App;
