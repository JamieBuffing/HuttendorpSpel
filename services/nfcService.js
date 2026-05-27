const {EventEmitter}=require('events');
class NFCService extends EventEmitter{
 start(){console.log('NFC service stub gestart')}
}
module.exports=new NFCService();
