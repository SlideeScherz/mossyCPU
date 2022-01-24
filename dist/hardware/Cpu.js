"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cpu = void 0;
const Hardware_1 = require("./Hardware");
const MMU_1 = require("./MMU");
const ascii_1 = require("../utility/ascii");
const System_1 = require("../System");
const opCode_1 = require("../utility/opCode");
var colors = require("../../node_modules/colors/lib/index");
/**For access to non-static MMU Methods*/
const MMU_CPU = new MMU_1.MMU(1, "MMU / CPU", false);
const ascii = new ascii_1.ASCII(); //Unread, but do not delete
/** The powerhouse */
class Cpu extends Hardware_1.Hardware {
    //we have to use hardwareName becuase name is a built in typscript thing
    constructor(hardwareID, hardwareName, debug) {
        super(hardwareID, hardwareName, debug);
        //Interupt members
        this.IRQNum = 0;
        this.inputBuffer = [];
        this.outputBuffer = [];
        this.IRQname = "CPU Interupt";
        /**The clock cycles the CPU has executed */
        this.cpuClockCount = 0;
        //CPU Registers
        /**Program Counter */
        this.pc = 0x0000;
        /**Stack Pointer. Used hold pointers for 2 byte Operations */
        this.sp = 0x0000;
        /**Instruction Register. Holds the Op Code for the current instruction  */
        this.ir = 0x00;
        /**X register */
        this.xReg = 0x00;
        /**Y Register */
        this.yReg = 0x00;
        /**Status register
         * - 0: carry flag
         * - 1: zero flag
         * - 2: interupt mask
         * - 3: decimal flag (not used)
         * - 4: break flag
         * - 5: no name and always set to 1
         * - 6: overflow flag
         * - 7: Negative flag
         */
        this.sReg = null;
        /**Accumulator */
        this.acc = 0x00;
        /**Step. Holds the data used for pipeline logic */
        this.step = 0;
        //=====Logical and debugging members=====//
        /** Array to store pipelineLog attributes, updated each pulse */
        this.pipelineLog = [];
        /** Status of operation. Still running = true */
        this.OpComplete = false;
        this.restartPipeline();
        this.log(this, colors.green("Pipeline initiated and reset"));
    }
    //========== CPU Methods ==========//
    /** Get hexadecimal 2’s complement
     * - Subtract the number from FF
     * - Add 1
     * @param data Number you wish to get 2's Comp of
     * @returns offset value
     */
    getOffset(data) {
        return 0xff - data + 1;
    }
    /** Log the CPU Pipeline steps */
    writePipeLineLog() {
        //data we want to store
        let pipelineState = {
            Cycle: this.cpuClockCount,
            PC: MMU_CPU.hexLog(this.pc, 2),
            SP: MMU_CPU.hexLog(this.sp, 2),
            IR: MMU_CPU.hexLog(this.ir, 1),
            byte1: MMU_CPU.hexLog(MMU_1.MMU.decodedByte1, 1),
            byte2: MMU_CPU.hexLog(MMU_1.MMU.decodedByte2, 1),
            ACC: MMU_CPU.hexLog(this.acc, 1),
            xReg: MMU_CPU.hexLog(this.xReg, 1),
            YReg: MMU_CPU.hexLog(this.yReg, 1),
            sReg: MMU_CPU.hexLog(this.sReg, 1),
            Step: this.step,
        };
        this.pipelineLog.push(pipelineState);
    }
    /** Get next opCode instruction.
     * - Always step 1.
     * - Uses the Program counter to select memory location.
     * - Before reading, INC the program counter.
     */
    fetch() {
        //only skip on the first execution
        if (this.cpuClockCount > 1) {
            this.pc++;
        }
        //Set the IR to the current data at the address in the PC
        this.ir = MMU_CPU.read(this.pc);
    }
    /** Decode the operands for an instruction
     * @param operands how many operands the opcode has (0-2)
     * @param register data (register) to read from if operands is 0
     */
    decode(operands, data) {
        //one byte decode
        if (operands === 0) {
            data == undefined
                ? this.errorLog(this, "Provide data in decode")
                : (MMU_1.MMU.decodedByte1 = data);
        }
        //one byte decode
        else if (operands === 1) {
            this.pc++;
            MMU_1.MMU.decodedByte1 = MMU_CPU.read(this.pc);
        }
        //two byte decode
        else if (operands === 2) {
            this.pc++;
            if (MMU_1.MMU.decodedByte1 === null) {
                MMU_1.MMU.decodedByte1 = MMU_CPU.read(this.pc);
            }
            else {
                MMU_1.MMU.decodedByte2 = MMU_CPU.read(this.pc);
                //Set the Stack Pointer with 16 bit data address
                this.sp = MMU_CPU.createPointer(MMU_1.MMU.decodedByte1, MMU_1.MMU.decodedByte2);
            }
        }
    }
    /** Check for IRQ Requests, Sets OpComplete to true */
    checkInterrupt() {
        if (this.inputBuffer.length !== 0)
            this.sReg = 2;
        //end the pipeline and restart, or handle interupt
        this.OpComplete = true;
    }
    /** resets pipeline Logic for when a operation is done*/
    restartPipeline() {
        //Re initialize all members
        this.step = 0;
        this.OpComplete = false;
        //Initiate these with null for decode logic
        MMU_1.MMU.decodedByte1 = null;
        MMU_1.MMU.decodedByte2 = null;
    }
    /** Load the accumulator with a constant */
    LDA() {
        switch (this.step) {
            case 2:
                this.decode(1);
                break;
            case 3:
                this.acc = MMU_1.MMU.decodedByte1;
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in LDA");
                break;
        }
    }
    /**Load the accumulator from memory */
    LDA_Mem() {
        switch (this.step) {
            case 2:
                this.decode(2);
                break;
            case 3:
                this.decode(2);
                break;
            //Load ACC from stack pointer
            case 4:
                this.acc = MMU_CPU.read(this.sp);
                break;
            case 5:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in LDA_Mem");
                break;
        }
    }
    /** store the ACC In memory at pointer address */
    STA() {
        switch (this.step) {
            case 2:
                this.decode(2);
                break;
            case 3:
                this.decode(2);
                break;
            //store ACC at stack pointer addr
            case 4:
                MMU_CPU.write(this.sp, this.acc);
                break;
            case 5:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in STA");
                break;
        }
    }
    /**Load ACC From xReg */
    TXA() {
        switch (this.step) {
            case 2:
                this.decode(0, this.xReg);
                break;
            case 3:
                this.acc = MMU_1.MMU.decodedByte1;
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in TXA");
                break;
        }
    }
    /**Load ACC From yReg */
    TYA() {
        switch (this.step) {
            case 2:
                this.decode(0, this.yReg);
                break;
            case 3:
                this.acc = MMU_1.MMU.decodedByte1;
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in TYA");
                break;
        }
    }
    /** Add with carry */
    ADC() {
        switch (this.step) {
            case 2:
                this.decode(2);
                break;
            case 3:
                this.decode(2);
                break;
            case 4:
                this.acc = MMU_CPU.read(this.sp) + this.acc;
                //check overflow
                if (this.acc > 0xffff) {
                    this.sReg = 6;
                    this.errorLog(this, "Warning, overflow");
                }
                break;
            case 5:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in ADC");
                break;
        }
    }
    /** Load xReg from constant */
    LDX() {
        switch (this.step) {
            case 2:
                this.decode(1);
                break;
            case 3:
                this.xReg = MMU_1.MMU.decodedByte1;
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in LDX");
                break;
        }
    }
    /** Load xReg from memory */
    LDX_Mem() {
        switch (this.step) {
            case 2:
                this.decode(2);
                break;
            case 3:
                this.decode(2);
                break;
            case 4:
                this.xReg = MMU_CPU.read(this.sp);
                break;
            case 5:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in LDX_Mem");
                break;
        }
    }
    /** Load xRegister from Acc */
    TAX() {
        switch (this.step) {
            case 2:
                this.decode(0, this.acc);
                break;
            case 3:
                this.xReg = MMU_1.MMU.decodedByte1;
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in TAX");
                break;
        }
    }
    /** Load yReg from constant */
    LDY() {
        switch (this.step) {
            case 2:
                this.decode(1);
                break;
            case 3:
                this.yReg = MMU_1.MMU.decodedByte1;
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in LDY");
                break;
        }
    }
    /** Load yRegister from memory addr */
    LDY_Mem() {
        switch (this.step) {
            case 2:
                this.decode(2);
                break;
            case 3:
                this.decode(2);
                break;
            case 4:
                this.yReg = MMU_CPU.read(this.sp);
                break;
            case 5:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in LDY_Mem");
                break;
        }
    }
    /** Load yReg from Accumulator */
    TAY() {
        switch (this.step) {
            case 2:
                this.decode(0, this.acc);
                break;
            case 3:
                this.yReg = MMU_1.MMU.decodedByte1;
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in TAY");
                break;
        }
    }
    /** No Operation */
    NOP() {
        switch (this.step) {
            case 2:
                break;
            case 3:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in NOP");
                break;
        }
    }
    /** Coffee anyone? */
    BRK() {
        switch (this.step) {
            case 2:
                //execute
                this.sReg = 4;
                break;
            case 3:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in BRK");
                break;
        }
    }
    /** Compare x to a byte in memory, set zFLag if equal */
    CPX() {
        switch (this.step) {
            case 2:
                this.decode(2);
                break;
            case 3:
                this.decode(2);
                break;
            case 4:
                if (this.xReg === MMU_CPU.read(this.sp))
                    this.sReg = 1; //set zFlag
                break;
            case 5:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in CPX");
                break;
        }
    }
    /** branch n Bytes if zflag is set */
    BNE() {
        switch (this.step) {
            case 2:
                this.decode(1);
                break;
            case 3:
                if (this.sReg !== 1)
                    this.pc -= this.getOffset(MMU_1.MMU.decodedByte1);
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in BNE");
                break;
        }
    }
    /** Increment the value of a byte */
    INC() {
        switch (this.step) {
            case 2:
                this.decode(2);
                break;
            case 3:
                this.decode(2);
                break;
            case 4:
                this.acc = MMU_CPU.read(this.sp);
                break;
            case 5:
                this.acc++;
                break;
            case 6:
                MMU_CPU.write(this.sp, this.acc);
                break;
            case 7:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in INC");
                break;
        }
    }
    /** Sys call */
    SYS() {
        switch (this.step) {
            case 2:
                if (this.xReg === 1 || this.xReg === 2) {
                    MMU_1.MMU.decodedByte1 = this.yReg;
                }
                else if (this.xReg === 3) {
                    this.errorLog(this, "SYS 3 will be coming in a later release");
                }
                break;
            case 3:
                if (this.xReg === 1) {
                    process.stdout.write(this.yReg.toString());
                }
                else if (this.xReg === 2) {
                    let data = ascii_1.ASCII.getChar(MMU_1.MMU.decodedByte1);
                    process.stdout.write("" + data); //must concat with a string or error will ensue
                }
                break;
            case 4:
                this.checkInterrupt();
                break;
            default:
                this.errorLog(this, "Error in SYS");
        }
    }
    /** Called each clock pulse From Interface ```clockListener```
     * - Execute OpCode based on IR
     */
    pulse() {
        //see the initial state of the CPU
        if (this.cpuClockCount === 0)
            console.log(colors.blue.bold("Output: "));
        //increment for each pulse
        this.cpuClockCount++;
        this.step++;
        //Always step 1. Fetch the opcode
        if (this.step === 1) {
            this.fetch();
            this.writePipeLineLog(); //Skip the block below, but we still want to write to the log
            return;
        }
        //Read the IR, end execute the correct step for each OpCode
        switch (this.ir) {
            case opCode_1.op.LDA:
                this.LDA();
                break;
            case opCode_1.op.LDA_Mem:
                this.LDA_Mem();
                break;
            case opCode_1.op.STA:
                this.STA();
                break;
            case opCode_1.op.TXA:
                this.TXA();
                break;
            case opCode_1.op.TYA:
                this.TYA();
                break;
            case opCode_1.op.ADC:
                this.ADC();
                break;
            case opCode_1.op.LDX:
                this.LDX();
                break;
            case opCode_1.op.LDX_Mem:
                this.LDX_Mem();
                break;
            case opCode_1.op.TAX:
                this.TAX();
                break;
            case opCode_1.op.LDY:
                this.LDY();
                break;
            case opCode_1.op.LDY_Mem:
                this.LDY_Mem();
                break;
            case opCode_1.op.TAY:
                this.TAY();
                break;
            case opCode_1.op.NOP:
                this.NOP();
                break;
            case opCode_1.op.BRK:
                this.BRK();
                break;
            case opCode_1.op.CPX:
                this.CPX();
                break;
            case opCode_1.op.BNE:
                this.BNE();
                break;
            case opCode_1.op.INC:
                this.INC();
                break;
            case opCode_1.op.SYS:
                this.SYS();
                break;
            default:
                this.errorLog(this, `Illegal value in IR: ${this.ir}. Forcing Shutdown`);
                this.sReg = 4; //throw breakflag
                break;
        }
        //Write to the pipeline log after each pulse
        this.writePipeLineLog();
        //Restart Pipline process after logic is set to completed
        if (this.OpComplete)
            this.restartPipeline();
        if (this.sReg === 4) {
            console.log(); // Add space
            if (this.debug)
                console.table(this.pipelineLog);
            System_1.System.stopSystem();
        }
    }
}
exports.Cpu = Cpu;
//# sourceMappingURL=Cpu.js.map