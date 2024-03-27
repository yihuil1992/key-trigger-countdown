using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace keyTriggerCountdown
{
    internal class Key
    {
        // 按键名称
        public string Name { get; set; }
        // 按键值
        public string Value { get; set; }

        public Key(string name, string value)
        {
            Name = name;
            Value = value;
        }
    }
}
