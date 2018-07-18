import { RandomProvider } from "./random";

module.exports = {
  parse: function(expression: string, type: FunctionType = FunctionType.ADD): Dice {
    return parse(expression, type);
  }
}

enum FunctionType {
  ABSOLUTE,
  DICE,
  ADD,
  MIN,
  MAX
};

export interface Dice {
  toString(first: boolean): string;
  getChildrenString(): string;
  toResultString(): string;
  process(random: RandomProvider);
}

class DiceFunction implements Dice {
  name: string;
  type: FunctionType;
  positive: boolean;
  private children: DiceFunction[] = [];
  parent: DiceFunction;
  value: number;

  constructor(type: FunctionType, positive: boolean, name: string = null) {
    this.type = type;
    this.name = name;
    this.positive = positive;
  }

  processChildren(random: RandomProvider) {
    this.children.forEach(element => {
      element.process(random);
    });
  }

  processTotal(numbers: number[], type: FunctionType) {
    let val = 0;
    if(type == FunctionType.ADD) {
      for(let i = 0; i < numbers.length; i++) {
        val += numbers[i];
      }
    }
    else if(type == FunctionType.MIN) {
      for(let i = 0; i < numbers.length; i++) {
        if(i === 0) {
          val = numbers[i];
        }
        val = Math.min(val, numbers[i]);
      }
    }
    else if(type == FunctionType.MAX) {
      for(let i = 0; i < numbers.length; i++) {
        if(i === 0) {
          val = numbers[i];
        }
        val = Math.max(val, numbers[i]);
      }
    }
    return val;
  }

  process(random: RandomProvider) {
    this.processChildren(random);
    let numbers: number[] = [];
    for(let i = 0; i < this.children.length; i++) {
      numbers.push(this.children[i].value);
    }
    this.value = this.processTotal(numbers, this.type);
    if(!this.positive) {
      this.value = -this.value;
    }
  }

  addChild(child: DiceFunction) {
    this.children.push(child);
    child.parent = this;
  }

  getSignString(includePositive: boolean): string {
    if(this.parent && (this.parent.type === FunctionType.MIN || this.parent.type === FunctionType.MAX)) {
      if(!this.positive) {
        return '-';
      }
      return '';
    }
    if(this.positive) {
      if(includePositive) {
        return ' + ';
      }
      return '';
    }
    return ' - ';
  }

  getNameString(): string {
    if(this.name) {
      return ' ' + this.name;
    }
    return '';
  }

  getChildrenString(): string {
    let text = '';
    let separator = ', ';
    if(this.type === FunctionType.ADD) {
      separator = '';
    }
    let firstChild = true;
    this.children.forEach(child => {
      text += child.toString(firstChild) + separator;
      firstChild = false;
    });
    text = text.substr(0, text.length - separator.length);
    return text;
  }

  getFunctionTypeString(): string {
    if(this.type === FunctionType.ADD) return '';
    return FunctionType[this.type].toLowerCase();
  }

  toString(first: boolean): string {
    let text = this.getSignString(!first) + this.getFunctionTypeString() + '(';
    text = text + this.getChildrenString() + ')' + this.getNameString();
    return text;
  }

  toResultString(): string {
    let includePositive = Boolean(this.parent);
    let text = '**' + String(this.value) + '**';
    text += ' (';
    let first = true;
    this.children.forEach(child => {
      if(!first) {
        text += ', ';
      }
      first = false;
      text += child.toResultString();
    });
    text += ')' + this.getNameString();
    return text;
  }
}

class DiceExpression extends DiceFunction {
  diceCount: number;
  dieSize: number;
  values: number[] = [];

  constructor(diceCount: number, dieSize: number, positive: boolean = true, name: string = null) {
    super(FunctionType.DICE, positive, name);
    this.diceCount = diceCount;
    this.dieSize = dieSize;
  }

  process(random: RandomProvider) {
    if(this.diceCount === 1) {
      this.value = random.getRandomWithMin(1, this.dieSize);
    }
    else {
      for(let i = 0; i < this.diceCount; i++) {
        let val = random.getRandomWithMin(1, this.dieSize);
        this.values.push(val);
      }
      this.value = this.processTotal(this.values, this.parent.type);
    }
    if(!this.positive) {
      this.value = -this.value;
    }
  }

  toString(first: boolean): string {
    let text = this.getSignString(!first);
    text += this.diceCount + 'd' + this.dieSize + this.getNameString();
    return text;
  }

  toResultString(): string {
    let text = '**' + this.value + '**' + this.getNameString();
    if(!this.values || this.values.length === 0) {
      return text;
    }
    text += ' (';
    for(let i = 0; i < this.values.length; i++) {
      if(i !== 0) {
        text += ', ';
      }
      text += Number(this.values[i]);
    }
    text += ')';
    return text;
  }
}

class Absolute extends DiceFunction {

  constructor(value: number, positive: boolean = true, name: string = null) {
    super(FunctionType.ABSOLUTE, positive, name);
    this.positive = positive;
    this.value = value;
  }

  process(random: RandomProvider) {
    if(!this.positive) {
      this.value = -this.value;
    }
  }

  toString(first: boolean): string {
    return this.getSignString(!first) + String(this.value) + this.getNameString();
  }

  toResultString(): string {
    return '**' + this.value + '**' + this.getNameString();
  }
}

function isPositive(symbol: string) {
  if(symbol === '-') {
    return false;
  }
  else if(symbol !== '+' && symbol !== '') {
    throw `Invalid symbol`
  }
  return true;
}

function parse(expression: string, type: FunctionType = FunctionType.ADD): DiceFunction {
  expression = expression.trim();
  let collection: DiceFunction = new DiceFunction(type, true);

  if(expression.length === 0) {
    collection.addChild(new DiceExpression(1, 20));
    return collection;
  }


  const expressionMatcher = /(([\+\-,])?\s*(min|max)(\(.*\)))([^\+\-,]*)|([\+\-,]?((?!min|max)[^\+\-\(\),])+)/g;
  let matches;
  while((matches = expressionMatcher.exec(expression)) !== null) {
    if(matches[1]) {
      // subexpression
      let type: FunctionType = FunctionType.ADD;
      let positive: boolean = true;
      
      if(matches[2]) {
        positive = isPositive(matches[2]);
      }


      if(matches[3] === 'min') {
        type = FunctionType.MIN;
      }
      else if(matches[3] === 'max') {
        type = FunctionType.MAX;
      }
      else {
        throw `Invalid function [${matches[1]}]`;
      }

      let subExpression = matches[4].substr(1, matches[4].length - 2);
      let child = parse(subExpression, type);
      child.name = matches[5].trim();
      child.positive = positive;
      collection.addChild(child);
      continue;
    }

    if(!matches[6] || !matches[6].trim()) continue;

    const expressionContentMatcher = /[^0-9\+\-d]*([\+\-]?)\s*(\d*)d?(\d*)\s*(.*)/;
    let current;
    if((current = expressionContentMatcher.exec(matches[6])) !== null) {
      let symbol = current[1];
      let positive: boolean = isPositive(symbol);

      if(!current[2] && !current[3]) {
        throw `Invalid expression [${current[0]}]`
      }

      let name = '';
      if(typeof current[4] !== 'undefined') {
        name = current[4].trim();
      }

      if(current[2] && !current[3]) {
        if(isNaN(Number(current[2]))) {
          throw `Invalid absolute number on [${current[0]}]`
        }
        collection.addChild(new Absolute(Number(current[2]), positive, name));
      }
      else {
        if(isNaN(Number(current[3]))) {
          throw `Invalid die size on [${current[0]}]`
        }

        let diceCount = 1;
        if(current[2]) {
          if(!isNaN(Number(current[2]))) {
            diceCount = Number(current[2]);
          }
        }

        let dieSize = Number(current[3]);

        if(dieSize < 2 || dieSize >= 1000000) {
          throw `Invalid die size [${current[0]}]`;
        }
        if(diceCount < 1 || diceCount > 200) {
          throw `Invalid dice count [${current[0]}]`;
        }

        collection.addChild(new DiceExpression(diceCount, dieSize, positive, name));
      }
    }
  }
  return collection;
}